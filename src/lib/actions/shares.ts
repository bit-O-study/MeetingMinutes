"use server";

import { revalidatePath } from "next/cache";
import { asc, eq } from "drizzle-orm";

import { requireNoteAccess } from "@/lib/access";
import { db } from "@/lib/db";
import { shareLinks } from "@/lib/db/schema";
import { absoluteUrl, linkToken } from "@/lib/utils";

/**
 * S-07 공유 링크 — 노트 1건, 읽기 전용.
 *
 * 스페이스 멤버가 아닌 사람에게 회의록을 보여 주는 유일한 통로다.
 * 그래서 노출 범위를 좁게 잡는다: 본문과 제목까지만이고
 * 할 일 체크·이력·다른 노트로 가는 경로는 전부 막는다(/p/[token] 참고).
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
  await requireNoteAccess(noteId);

  const rows = await db
    .select()
    .from(shareLinks)
    .where(eq(shareLinks.noteId, noteId))
    .orderBy(asc(shareLinks.createdAt));

  const now = new Date();
  return rows.map((row) => ({
    id: row.id,
    url: absoluteUrl(`/p/${row.token}`),
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    viewCount: row.viewCount,
    active: !row.revokedAt && (!row.expiresAt || row.expiresAt > now),
  }));
}

/**
 * 링크를 발급한다.
 *
 * 만료 기본값을 두지 않는다. 스터디 회의록을 한 번 보여 주는 것과
 * 인수인계 메모를 인계 기간 내내 열어 두는 것은 필요한 기간이 전혀 다르다.
 * 고르게 하고, 고르지 않으면 만료 없음으로 둔다 — 회수는 언제든 되니까.
 */
export async function createShareLink(
  noteId: string,
  opts: { expiresInDays?: number | null } = {},
): Promise<ShareLinkView> {
  const { userId, note } = await requireNoteAccess(noteId);

  const expiresAt =
    opts.expiresInDays && opts.expiresInDays > 0
      ? new Date(Date.now() + opts.expiresInDays * 24 * 60 * 60 * 1000)
      : null;

  const [row] = await db
    .insert(shareLinks)
    .values({ noteId, token: linkToken(), createdBy: userId, expiresAt })
    .returning();

  revalidatePath(`/s/${note.spaceId}/n/${noteId}`);

  return {
    id: row.id,
    url: absoluteUrl(`/p/${row.token}`),
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
    .where(eq(shareLinks.id, shareId))
    .limit(1);

  if (!row) throw new Error("링크를 찾을 수 없습니다.");
  const { note } = await requireNoteAccess(row.noteId);

  await db.update(shareLinks).set({ revokedAt: new Date() }).where(eq(shareLinks.id, shareId));

  revalidatePath(`/s/${note.spaceId}/n/${row.noteId}`);
  return listShareLinks(row.noteId);
}
