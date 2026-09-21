import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { notes, shareLinks, spaces } from "@/lib/db/schema";

/**
 * 공유 링크로 들어온 사람이 노트를 읽는 경로.
 *
 * 로그인을 요구하지 않는다. 토큰이 유일한 열쇠다.
 * 서버 액션이 아니라 평범한 조회 함수로 둔다 — 공개 페이지가 렌더하면서
 * 한 번 부르는 게 전부이고, 액션으로 두면 굳이 엔드포인트가 하나 더 생긴다.
 */

export type SharedNote = {
  title: string;
  spaceName: string;
  content: unknown;
  updatedAt: Date;
};

/**
 * 토큰으로 노트를 읽는다. 없거나 만료·회수됐으면 null.
 *
 * 공유 시점을 고정하지 않는다. 링크가 살아 있는 동안 노트를 고치면
 * 고친 내용이 보인다 — 공유한 사람이 오타를 고쳤는데 옛날 것이 보이면
 * 그게 더 당황스럽다.
 */
export async function readSharedNote(token: string): Promise<SharedNote | null> {
  const [row] = await db
    .select({
      shareId: shareLinks.id,
      expiresAt: shareLinks.expiresAt,
      revokedAt: shareLinks.revokedAt,
      title: notes.title,
      content: notes.content,
      updatedAt: notes.updatedAt,
      spaceName: spaces.name,
    })
    .from(shareLinks)
    .innerJoin(notes, eq(notes.id, shareLinks.noteId))
    .innerJoin(spaces, eq(spaces.id, notes.spaceId))
    .where(and(eq(shareLinks.token, token), isNull(notes.deletedAt), isNull(spaces.deletedAt)))
    .limit(1);

  if (!row) return null;
  if (row.revokedAt) return null;
  if (row.expiresAt && row.expiresAt <= new Date()) return null;

  // 조회 수는 세어 두면 "이거 아무도 안 봤네" 판단에 쓸모 있다.
  // 실패해도 읽기를 막지 않는다.
  void db
    .update(shareLinks)
    .set({ viewCount: sql`${shareLinks.viewCount} + 1` })
    .where(eq(shareLinks.id, row.shareId))
    .catch(() => {});

  return {
    title: row.title,
    spaceName: row.spaceName,
    content: row.content,
    updatedAt: row.updatedAt,
  };
}
