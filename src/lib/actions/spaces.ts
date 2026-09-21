"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, asc, eq, isNull } from "drizzle-orm";

import { requireSpaceMember, requireSpaceOwner } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { inviteLinks, notes, spaceMembers, spaces, users } from "@/lib/db/schema";
import type { SpaceKind } from "@/lib/db/schema";
import { absoluteUrl, linkToken } from "@/lib/utils";

/**
 * 스페이스 — 권한 경계이자 멤버의 단위.
 *
 * 멤버끼리 권한 차등을 두지 않는다. 소유자만 초대·이름 변경·삭제를 더 할 수 있다.
 */

export async function createSpace(input: { name: string; kind: SpaceKind }) {
  const user = await requireUser();
  const name = input.name.trim();
  if (!name) throw new Error("이름을 입력하세요.");

  const [space] = await db
    .insert(spaces)
    .values({ name, kind: input.kind, ownerId: user.id })
    .returning();

  await db.insert(spaceMembers).values({
    spaceId: space.id,
    userId: user.id,
    role: "owner",
  });

  redirect(`/s/${space.id}`);
}

export async function renameSpace(spaceId: string, name: string) {
  await requireSpaceOwner(spaceId);
  const trimmed = name.trim();
  if (!trimmed) return;

  await db.update(spaces).set({ name: trimmed }).where(eq(spaces.id, spaceId));
  revalidatePath(`/s/${spaceId}`);
}

/**
 * 스페이스를 지운다. 노트도 함께 사라지므로 소유자만 할 수 있다.
 * 실제로 지우지 않고 표시만 한다 — 실수로 눌렀을 때 되돌릴 수 있어야 한다.
 */
export async function deleteSpace(spaceId: string) {
  await requireSpaceOwner(spaceId);
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

export async function removeMember(spaceId: string, userId: string) {
  const { userId: actor } = await requireSpaceOwner(spaceId);
  if (userId === actor) throw new Error("소유자는 자신을 제외할 수 없습니다.");

  await db
    .delete(spaceMembers)
    .where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, userId)));

  revalidatePath(`/s/${spaceId}`);
}

/** 소유자가 떠나려면 먼저 넘겨야 한다. 주인 없는 스페이스를 만들지 않는다. */
export async function transferOwnership(spaceId: string, toUserId: string) {
  const { userId: actor } = await requireSpaceOwner(spaceId);

  const [target] = await db
    .select({ userId: spaceMembers.userId })
    .from(spaceMembers)
    .where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, toUserId)))
    .limit(1);

  if (!target) throw new Error("멤버가 아닙니다.");

  await db
    .update(spaceMembers)
    .set({ role: "owner" })
    .where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, toUserId)));

  await db
    .update(spaceMembers)
    .set({ role: "member" })
    .where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, actor)));

  await db.update(spaces).set({ ownerId: toUserId }).where(eq(spaces.id, spaceId));

  revalidatePath(`/s/${spaceId}`);
}

export async function leaveSpace(spaceId: string) {
  const { userId, role } = await requireSpaceMember(spaceId);
  if (role === "owner") {
    throw new Error("소유자는 다른 멤버에게 넘긴 뒤에 나갈 수 있습니다.");
  }

  await db
    .delete(spaceMembers)
    .where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, userId)));

  redirect("/");
}

/* ────────────────────────────────────────────────────────────
   초대 링크

   이메일이 아니라 링크로 초대한다. 스터디에서 주소를 미리 받아 두는 건
   생각보다 마찰이 크다.
   ──────────────────────────────────────────────────────────── */

export async function listInviteLinks(spaceId: string) {
  await requireSpaceOwner(spaceId);

  const rows = await db
    .select()
    .from(inviteLinks)
    .where(eq(inviteLinks.spaceId, spaceId))
    .orderBy(asc(inviteLinks.createdAt));

  return rows.map((row) => ({
    ...row,
    url: absoluteUrl(`/join/${row.token}`),
    active: !row.revokedAt && (!row.expiresAt || row.expiresAt > new Date()),
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
  const { userId } = await requireSpaceOwner(spaceId);

  const expiresAt =
    opts.expiresInDays && opts.expiresInDays > 0
      ? new Date(Date.now() + opts.expiresInDays * 24 * 60 * 60 * 1000)
      : null;

  const [row] = await db
    .insert(inviteLinks)
    .values({ spaceId, token: linkToken(), createdBy: userId, expiresAt })
    .returning();

  revalidatePath(`/s/${spaceId}`);
  return { ...row, url: absoluteUrl(`/join/${row.token}`) };
}

export async function revokeInviteLink(inviteId: string) {
  const [row] = await db
    .select({ spaceId: inviteLinks.spaceId })
    .from(inviteLinks)
    .where(eq(inviteLinks.id, inviteId))
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
    .where(eq(inviteLinks.id, inviteId))
    .limit(1);

  if (!row) throw new Error("링크를 찾을 수 없습니다.");

  await revokeInviteLink(inviteId);
  return createInviteLink(row.spaceId, { expiresInDays });
}

/**
 * 초대 링크 미리보기. 로그인 전에도 보여 줘야 해서 멤버십을 요구하지 않는다.
 * 스페이스 이름과 멤버 수까지만 — 노트 제목은 절대 노출하지 않는다.
 */
export async function peekInvite(token: string) {
  const [row] = await db
    .select({
      spaceId: spaces.id,
      spaceName: spaces.name,
      kind: spaces.kind,
      expiresAt: inviteLinks.expiresAt,
      revokedAt: inviteLinks.revokedAt,
    })
    .from(inviteLinks)
    .innerJoin(spaces, eq(spaces.id, inviteLinks.spaceId))
    .where(and(eq(inviteLinks.token, token), isNull(spaces.deletedAt)))
    .limit(1);

  if (!row || row.revokedAt || (row.expiresAt && row.expiresAt <= new Date())) {
    return null;
  }

  const members = await db
    .select({ id: users.id, name: users.name, image: users.image })
    .from(spaceMembers)
    .innerJoin(users, eq(users.id, spaceMembers.userId))
    .where(eq(spaceMembers.spaceId, row.spaceId))
    .orderBy(asc(spaceMembers.joinedAt))
    .limit(6);

  return { spaceName: row.spaceName, kind: row.kind, members };
}

/** 로그인한 사용자를 스페이스에 넣는다. 이미 멤버면 그냥 들여보낸다. */
export async function joinByInviteToken(token: string) {
  const user = await requireUser();

  const [row] = await db
    .select({
      spaceId: inviteLinks.spaceId,
      expiresAt: inviteLinks.expiresAt,
      revokedAt: inviteLinks.revokedAt,
    })
    .from(inviteLinks)
    .innerJoin(spaces, eq(spaces.id, inviteLinks.spaceId))
    .where(and(eq(inviteLinks.token, token), isNull(spaces.deletedAt)))
    .limit(1);

  if (!row || row.revokedAt || (row.expiresAt && row.expiresAt <= new Date())) {
    throw new Error("만료되었거나 회수된 초대 링크입니다.");
  }

  await db
    .insert(spaceMembers)
    .values({ spaceId: row.spaceId, userId: user.id, role: "member" })
    .onConflictDoNothing();

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
