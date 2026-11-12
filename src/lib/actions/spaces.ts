"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";

import { requireSpaceMember, requireSpaceOwner } from "@/lib/access";
import { createSpaceInput, idInput, linkExpiryInput, spaceNameInput } from "@/lib/action-input";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { inviteLinks, notes, shareLinks, spaceMembers, spaceRemovals, spaces, users } from "@/lib/db/schema";
import type { SpaceKind } from "@/lib/db/schema";
import { hashLinkToken, isSealedLinkToken, openLinkToken, sealLinkToken, storedLinkToken } from "@/lib/token-store";
import { absoluteUrl, linkToken } from "@/lib/utils";

/**
 * 스페이스 — 권한 경계이자 멤버의 단위.
 *
 * 멤버끼리 권한 차등을 두지 않는다. 소유자만 초대·이름 변경·삭제를 더 할 수 있다.
 */

export async function createSpace(input: { name: string; kind: SpaceKind }) {
  const user = await requireUser();
  // 서버 액션은 네트워크 경계다. 타입에 없는 kind나 수 MB짜리 이름을 여기서 막는다.
  const parsed = createSpaceInput.safeParse(input);
  if (!parsed.success) throw new Error("이름(80자 이내)과 용도를 확인하세요.");
  const { name, kind } = parsed.data;

  const [space] = await db
    .insert(spaces)
    .values({ name, kind, ownerId: user.id })
    .returning();

  await db.insert(spaceMembers).values({
    spaceId: space.id,
    userId: user.id,
    role: "owner",
  });

  redirect(`/s/${space.id}`);
}

export async function renameSpace(spaceId: string, name: string) {
  await requireSpaceOwner(idInput.parse(spaceId));
  const parsed = spaceNameInput.safeParse(name);
  if (!parsed.success) return;

  await db.update(spaces).set({ name: parsed.data }).where(eq(spaces.id, spaceId));
  revalidatePath(`/s/${spaceId}`);
}

/**
 * 스페이스를 지운다. 노트도 함께 사라지므로 소유자만 할 수 있다.
 * 실제로 지우지 않고 표시만 한다 — 실수로 눌렀을 때 되돌릴 수 있어야 한다.
 */
export async function deleteSpace(spaceId: string) {
  await requireSpaceOwner(idInput.parse(spaceId));
  await db.update(spaces).set({ deletedAt: new Date() }).where(eq(spaces.id, spaceId));
  redirect("/");
}

/* ────────────────────────────────────────────────────────────
   멤버
   ──────────────────────────────────────────────────────────── */

export async function listSpaceMembers(spaceId: string) {
  await requireSpaceMember(spaceId);

  return db
    .select({
      id: users.id,
      name: users.name,
      image: users.image,
      role: spaceMembers.role,
      joinedAt: spaceMembers.joinedAt,
    })
    .from(spaceMembers)
    .innerJoin(users, eq(users.id, spaceMembers.userId))
    .where(eq(spaceMembers.spaceId, spaceId))
    .orderBy(asc(spaceMembers.joinedAt), asc(users.id));
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * 스페이스를 떠난 사람이 만들어 둔 공유 링크를 회수한다.
 *
 * 공유 링크는 만든 사람의 멤버 자격과 무관하게 열렸다. 제외될 사람이 미리 링크를
 * 만들어 두면 이후에 쓰인 회의록까지 계속 읽을 수 있었다(링크는 최신 본문을 보여 준다).
 */
async function revokeSharesCreatedBy(tx: Tx, spaceId: string, userId: string) {
  const spaceNotes = tx.select({ id: notes.id }).from(notes).where(eq(notes.spaceId, spaceId));
  await tx
    .update(shareLinks)
    .set({ revokedAt: new Date() })
    .where(and(eq(shareLinks.createdBy, userId), isNull(shareLinks.revokedAt), inArray(shareLinks.noteId, spaceNotes)));
}

/**
 * 멤버를 제외한다.
 *
 *   · 제외 기록(space_removals)을 남긴다 — 예전에 받은 초대 링크로 바로 돌아오지 못하게
 *   · 그 사람이 만든 공유 링크를 회수한다
 *   · 열어 둔 공동 편집 연결은 collab 서버가 주기적인 멤버 확인으로 닫는다(최대 30초)
 */
export async function removeMember(spaceId: string, userId: string) {
  const { userId: actor } = await requireSpaceOwner(idInput.parse(spaceId));
  idInput.parse(userId);
  if (userId === actor) throw new Error("소유자는 자신을 제외할 수 없습니다.");

  await db.transaction(async (tx) => {
    const removed = await tx
      .delete(spaceMembers)
      .where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, userId)))
      .returning({ userId: spaceMembers.userId });
    if (removed.length === 0) return;

    await tx
      .insert(spaceRemovals)
      .values({ spaceId, userId, removedBy: actor })
      .onConflictDoUpdate({
        target: [spaceRemovals.spaceId, spaceRemovals.userId],
        set: { removedBy: actor, removedAt: new Date() },
      });
    await revokeSharesCreatedBy(tx, spaceId, userId);
  });

  revalidatePath(`/s/${spaceId}`);
}

/** 소유자가 떠나려면 먼저 넘겨야 한다. 주인 없는 스페이스를 만들지 않는다. */
export async function transferOwnership(spaceId: string, toUserId: string) {
  const { userId: actor } = await requireSpaceOwner(idInput.parse(spaceId));
  idInput.parse(toUserId);

  if (actor === toUserId) return;
  await db.transaction(async (tx) => {
    const [current] = await tx.select().from(spaces).where(eq(spaces.id, spaceId)).for("update");
    if (current?.ownerId !== actor) throw new Error("소유자가 변경되었습니다. 새로고침하세요.");
    const [target] = await tx.select().from(spaceMembers)
      .where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, toUserId))).for("update");
    if (!target) throw new Error("멤버가 아닙니다.");
    await tx.update(spaceMembers).set({ role: "owner" }).where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, toUserId)));
    await tx.update(spaceMembers).set({ role: "member" }).where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, actor)));
    await tx.update(spaces).set({ ownerId: toUserId }).where(eq(spaces.id, spaceId));
  });

  revalidatePath(`/s/${spaceId}`);
}

/**
 * 스스로 나간다. 제외가 아니므로 기록은 남기지 않는다(초대 링크로 다시 올 수 있다).
 * 나간 사람이 만든 공유 링크는 회수한다 — 더는 볼 권한이 없는 노트를 계속 열어 두지 않게.
 */
export async function leaveSpace(spaceId: string) {
  const { userId, role } = await requireSpaceMember(idInput.parse(spaceId));
  if (role === "owner") {
    throw new Error("소유자는 다른 멤버에게 넘긴 뒤에 나갈 수 있습니다.");
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(spaceMembers)
      .where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, userId)));
    await revokeSharesCreatedBy(tx, spaceId, userId);
  });

  redirect("/");
}

/* ────────────────────────────────────────────────────────────
   초대 링크

   이메일이 아니라 링크로 초대한다. 스터디에서 주소를 미리 받아 두는 건
   생각보다 마찰이 크다.

   토큰은 해시(token_hash)로만 찾는다. token 칸은 링크를 다시 보여 주기 위한
   암호문이다(lib/token-store.ts).
   ──────────────────────────────────────────────────────────── */

function expiryFrom(opts: unknown): Date | null {
  const parsed = linkExpiryInput.safeParse(opts ?? {});
  if (!parsed.success) throw new Error("만료 기간은 1~365일 또는 만료 없음이어야 합니다.");
  const days = parsed.data.expiresInDays;
  return days ? new Date(Date.now() + days * 24 * 60 * 60 * 1000) : null;
}

export async function listInviteLinks(spaceId: string) {
  await requireSpaceOwner(spaceId);

  const rows = await db
    .select()
    .from(inviteLinks)
    .where(eq(inviteLinks.spaceId, spaceId))
    .orderBy(asc(inviteLinks.createdAt));

  const now = new Date();
  return Promise.all(rows.map(async (row) => {
    const token = openLinkToken(row.token);
    // 0008 이전에 만든 평문 사본은 보는 김에 암호문으로 바꿔 둔다.
    if (token && !isSealedLinkToken(row.token)) {
      await db.update(inviteLinks).set({ token: sealLinkToken(token) }).where(eq(inviteLinks.id, row.id));
    }
    return {
      id: row.id,
      spaceId: row.spaceId,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      revokedAt: row.revokedAt,
      // 키가 바뀌어 풀 수 없는 링크는 다시 보여 줄 수 없다. 재발급하면 된다.
      url: token ? absoluteUrl(`/join/${token}`) : "",
      active: Boolean(token) && !row.revokedAt && (!row.expiresAt || row.expiresAt > now),
    };
  }));
}

/**
 * 새 링크를 발급한다. 기존 링크는 자동으로 끊지 않는다 —
 * 이미 공유해 둔 링크가 조용히 죽으면 초대받은 쪽만 당황한다.
 * 끊으려면 회수를 명시적으로 누른다.
 */
export async function createInviteLink(
  spaceId: string,
  opts: { expiresInDays?: number | null } = {},
) {
  const { userId } = await requireSpaceOwner(idInput.parse(spaceId));
  const expiresAt = expiryFrom(opts);

  const token = linkToken();
  const [row] = await db
    .insert(inviteLinks)
    .values({ spaceId, ...storedLinkToken(token), createdBy: userId, expiresAt })
    .returning();

  revalidatePath(`/s/${spaceId}`);
  return {
    id: row.id,
    spaceId: row.spaceId,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    url: absoluteUrl(`/join/${token}`),
  };
}

export async function revokeInviteLink(inviteId: string) {
  const [row] = await db
    .select({ spaceId: inviteLinks.spaceId })
    .from(inviteLinks)
    .where(eq(inviteLinks.id, idInput.parse(inviteId)))
    .limit(1);

  if (!row) throw new Error("링크를 찾을 수 없습니다.");
  await requireSpaceOwner(row.spaceId);

  await db.update(inviteLinks).set({ revokedAt: new Date() }).where(eq(inviteLinks.id, inviteId));
  revalidatePath(`/s/${row.spaceId}`);
}

/** 회수한 링크를 되살리는 대신 새로 발급한다. 죽은 토큰이 다시 살아나면 추적이 어렵다. */
export async function reissueInviteLink(inviteId: string, expiresInDays?: number | null) {
  const [row] = await db
    .select({ spaceId: inviteLinks.spaceId })
    .from(inviteLinks)
    .where(eq(inviteLinks.id, idInput.parse(inviteId)))
    .limit(1);

  if (!row) throw new Error("링크를 찾을 수 없습니다.");
  // 회수하기 전에 만료 값부터 확인한다. 잘못된 값으로 기존 링크만 죽는 일이 없게.
  expiryFrom({ expiresInDays });

  await revokeInviteLink(inviteId);
  return createInviteLink(row.spaceId, { expiresInDays });
}

/** 토큰으로 살아 있는 초대를 찾는다. 해시로만 찾는다. */
async function findLiveInvite(token: string) {
  if (typeof token !== "string" || token.length === 0 || token.length > 128) return null;
  const [row] = await db
    .select({
      spaceId: spaces.id,
      spaceName: spaces.name,
      kind: spaces.kind,
      createdAt: inviteLinks.createdAt,
      expiresAt: inviteLinks.expiresAt,
      revokedAt: inviteLinks.revokedAt,
    })
    .from(inviteLinks)
    .innerJoin(spaces, eq(spaces.id, inviteLinks.spaceId))
    .where(and(eq(inviteLinks.tokenHash, hashLinkToken(token)), isNull(spaces.deletedAt)))
    .limit(1);

  if (!row || row.revokedAt || (row.expiresAt && row.expiresAt <= new Date())) return null;
  return row;
}

/**
 * 초대 링크 미리보기. 로그인 전에도 보여 줘야 해서 멤버십을 요구하지 않는다.
 * 스페이스 이름과 멤버 수까지만 — 노트 제목은 절대 노출하지 않는다.
 */
export async function peekInvite(token: string) {
  const row = await findLiveInvite(token);
  if (!row) return null;

  const members = await db
    .select({ id: users.id, name: users.name, image: users.image })
    .from(spaceMembers)
    .innerJoin(users, eq(users.id, spaceMembers.userId))
    .where(eq(spaceMembers.spaceId, row.spaceId))
    .orderBy(asc(spaceMembers.joinedAt))
    .limit(6);

  return { spaceName: row.spaceName, kind: row.kind, members };
}

/**
 * 로그인한 사용자를 스페이스에 넣는다. 이미 멤버면 그냥 들여보낸다.
 *
 * 제외된 사람은 **제외 이전에 발급된** 링크로 돌아오지 못한다. 소유자가 제외 뒤에
 * 새로 발급한 링크로는 들어올 수 있고, 그때 제외 기록을 지운다.
 */
export async function joinByInviteToken(token: string) {
  const user = await requireUser();
  const row = await findLiveInvite(token);
  if (!row) throw new Error("만료되었거나 회수된 초대 링크입니다.");

  await db.transaction(async (tx) => {
    const [removal] = await tx
      .select({ removedAt: spaceRemovals.removedAt })
      .from(spaceRemovals)
      .where(and(eq(spaceRemovals.spaceId, row.spaceId), eq(spaceRemovals.userId, user.id)))
      .limit(1);
    if (removal && row.createdAt <= removal.removedAt) {
      throw new Error("이 초대 링크로는 다시 참여할 수 없습니다. 소유자에게 새 링크를 요청하세요.");
    }

    await tx
      .insert(spaceMembers)
      .values({ spaceId: row.spaceId, userId: user.id, role: "member" })
      .onConflictDoNothing();
    if (removal) {
      await tx
        .delete(spaceRemovals)
        .where(and(eq(spaceRemovals.spaceId, row.spaceId), eq(spaceRemovals.userId, user.id)));
    }
  });

  redirect(`/s/${row.spaceId}`);
}

/* ────────────────────────────────────────────────────────────
   목록 보조
   ──────────────────────────────────────────────────────────── */

/** 스페이스 카드에 쓰는 노트 수. 휴지통에 든 노트는 빼고 센다. */
export async function countSpaceNotes(spaceId: string) {
  await requireSpaceMember(spaceId);
  const rows = await db
    .select({ id: notes.id })
    .from(notes)
    .where(and(eq(notes.spaceId, spaceId), isNull(notes.deletedAt)));
  return rows.length;
}
