"use server";

import { revalidatePath } from "next/cache";
import { asc, eq } from "drizzle-orm";

import { requireNoteAccess } from "@/lib/access";
import { idInput, linkExpiryInput } from "@/lib/action-input";
import { db } from "@/lib/db";
import { shareLinks } from "@/lib/db/schema";
import { isSealedLinkToken, openLinkToken, sealLinkToken, storedLinkToken } from "@/lib/token-store";
import { absoluteUrl, linkToken } from "@/lib/utils";

/**
 * S-07 공유 링크 — 노트 1건, 읽기 전용.
 *
 * 스페이스 멤버가 아닌 사람에게 회의록을 보여 주는 유일한 통로다.
 * 그래서 노출 범위를 좁게 잡는다: 본문과 제목까지만이고
 * 할 일 체크·이력·다른 노트로 가는 경로는 전부 막는다(/p/[token] 참고).
 *
 * 토큰은 해시(token_hash)로만 찾고, token 칸은 링크를 다시 보여 주기 위한
 * 암호문이다(lib/token-store.ts). 만든 사람이 스페이스에서 제외·탈퇴하면
 * 그 사람의 링크는 회수된다(actions/spaces.ts).
 */

export type ShareLinkView = {
  id: string;
  url: string;
  createdAt: Date;
  expiresAt: Date | null;
  revokedAt: Date | null;
  viewCount: number;
  active: boolean;
};

export async function listShareLinks(noteId: string): Promise<ShareLinkView[]> {
  await requireNoteAccess(idInput.parse(noteId));

  const rows = await db
    .select()
    .from(shareLinks)
    .where(eq(shareLinks.noteId, noteId))
    .orderBy(asc(shareLinks.createdAt));

  const now = new Date();
  return Promise.all(rows.map(async (row) => {
    const token = openLinkToken(row.token);
    // 0008 이전에 만든 평문 사본은 보는 김에 암호문으로 바꿔 둔다.
    if (token && !isSealedLinkToken(row.token)) {
      await db.update(shareLinks).set({ token: sealLinkToken(token) }).where(eq(shareLinks.id, row.id));
    }
    return {
      id: row.id,
      // 키가 바뀌어 풀 수 없는 링크는 다시 보여 줄 수 없다. 새로 만들면 된다.
      url: token ? absoluteUrl(`/p/${token}`) : "",
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      revokedAt: row.revokedAt,
      viewCount: row.viewCount,
      active: Boolean(token) && !row.revokedAt && (!row.expiresAt || row.expiresAt > now),
    };
  }));
}

/**
 * 링크를 발급한다.
 *
 * 만료 기본값을 두지 않는다. 스터디 회의록을 한 번 보여 주는 것과
 * 인수인계 메모를 인계 기간 내내 열어 두는 것은 필요한 기간이 전혀 다르다.
 * 고르게 하고, 고르지 않으면 만료 없음으로 둔다 — 회수는 언제든 되니까.
 * 숫자로 고르면 1~365일만 받는다.
 */
export async function createShareLink(
  noteId: string,
  opts: { expiresInDays?: number | null } = {},
): Promise<ShareLinkView> {
  const { userId, note } = await requireNoteAccess(idInput.parse(noteId));
  const parsed = linkExpiryInput.safeParse(opts ?? {});
  if (!parsed.success) throw new Error("만료 기간은 1~365일 또는 만료 없음이어야 합니다.");
  const days = parsed.data.expiresInDays;
  const expiresAt = days ? new Date(Date.now() + days * 24 * 60 * 60 * 1000) : null;

  const token = linkToken();
  const [row] = await db
    .insert(shareLinks)
    .values({ noteId, ...storedLinkToken(token), createdBy: userId, expiresAt })
    .returning();

  revalidatePath(`/s/${note.spaceId}/n/${noteId}`);

  return {
    id: row.id,
    url: absoluteUrl(`/p/${token}`),
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    viewCount: row.viewCount,
    active: true,
  };
}

/** 회수하면 즉시 막힌다. 토큰을 지우지 않고 표시만 해서 발급 이력을 남긴다. */
export async function revokeShareLink(shareId: string) {
  const [row] = await db
    .select({ noteId: shareLinks.noteId })
    .from(shareLinks)
    .where(eq(shareLinks.id, idInput.parse(shareId)))
    .limit(1);

  if (!row) throw new Error("링크를 찾을 수 없습니다.");
  const { note } = await requireNoteAccess(row.noteId);

  await db.update(shareLinks).set({ revokedAt: new Date() }).where(eq(shareLinks.id, shareId));

  revalidatePath(`/s/${note.spaceId}/n/${row.noteId}`);
  return listShareLinks(row.noteId);
}
