"use server";

import { desc, eq } from "drizzle-orm";

import { requireNoteAccess } from "@/lib/access";
import { db } from "@/lib/db";
import { noteRevisions, users } from "@/lib/db/schema";

/**
 * 변경 이력. 확정·버전 스냅샷 개념을 대신한다.
 *
 * 기록은 공동 편집 서버가 한다(server/collab.ts). 누가 무엇을 바꿨는지
 * 아는 곳이 거기뿐이고, 여러 클라이언트가 각자 기록하면 같은 변경이
 * 접속자 수만큼 쌓인다.
 */

/** 목록에 쓸 만큼만. content는 크니까 빼고 가져온다. */
export async function listRevisions(noteId: string) {
  await requireNoteAccess(noteId);

  return db
    .select({
      id: noteRevisions.id,
      summary: noteRevisions.summary,
      isRevert: noteRevisions.isRevert,
      createdAt: noteRevisions.createdAt,
      actorId: noteRevisions.actorId,
      actorName: users.name,
      actorImage: users.image,
    })
    .from(noteRevisions)
    .leftJoin(users, eq(users.id, noteRevisions.actorId))
    .where(eq(noteRevisions.noteId, noteId))
    .orderBy(desc(noteRevisions.createdAt))
    .limit(50);
}

/** 미리보기용. 그 시점의 Tiptap JSON 전체. */
export async function getRevisionContent(noteId: string, revisionId: string) {
  await requireNoteAccess(noteId);

  const [row] = await db
    .select({ content: noteRevisions.content, createdAt: noteRevisions.createdAt })
    .from(noteRevisions)
    .where(eq(noteRevisions.id, revisionId))
    .limit(1);

  if (!row) throw new Error("이력을 찾을 수 없습니다.");
  return row;
}

/**
 * 그 시점으로 되돌린다.
 *
 * 되돌린 행위도 이력에 남긴다 — 되돌리기 자체를 다시 되돌릴 수 있어야
 * 사람이 마음 놓고 누른다. 본문 반영은 호출한 클라이언트가 하고,
 * Yjs가 차이를 계산해 접속자 모두에게 전파한다.
 */
export async function restoreRevision(noteId: string, revisionId: string) {
  const { userId } = await requireNoteAccess(noteId);

  const [target] = await db
    .select()
    .from(noteRevisions)
    .where(eq(noteRevisions.id, revisionId))
    .limit(1);

  if (!target || target.noteId !== noteId) throw new Error("이력을 찾을 수 없습니다.");

  const stamp = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(target.createdAt);

  await db.insert(noteRevisions).values({
    noteId,
    actorId: userId,
    content: target.content,
    summary: `${stamp} 시점으로 되돌림`,
    isRevert: true,
  });

  return target.content;
}
