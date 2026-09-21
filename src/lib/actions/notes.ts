"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, desc, eq, isNull } from "drizzle-orm";

import { requireNoteAccess, requireSpaceMember } from "@/lib/access";
import { db } from "@/lib/db";
import { noteDocs, notes, spaces } from "@/lib/db/schema";
import type { NoteStatus, TemplateKind } from "@/lib/db/schema";
import { TEMPLATES, buildTemplateDoc, docToPlainText } from "@/lib/templates";

/** 다음 회차 번호. 스터디는 회차가 규칙적이라 제목을 미리 채워 준다. */
async function nextSessionNo(spaceId: string): Promise<number> {
  const [last] = await db
    .select({ n: notes.sessionNo })
    .from(notes)
    .where(and(eq(notes.spaceId, spaceId), eq(notes.template, "study"), isNull(notes.deletedAt)))
    .orderBy(desc(notes.sessionNo))
    .limit(1);
  return (last?.n ?? 0) + 1;
}

export async function suggestNoteTitle(spaceId: string, template: TemplateKind) {
  await requireSpaceMember(spaceId);
  const meta = TEMPLATES[template];
  const sessionNo = meta.usesSessionNo ? await nextSessionNo(spaceId) : 1;
  return { title: meta.defaultTitle({ sessionNo, today: new Date() }), sessionNo };
}

export async function createNote(input: {
  spaceId: string;
  template: TemplateKind;
  title?: string;
}) {
  const { userId } = await requireSpaceMember(input.spaceId);
  const meta = TEMPLATES[input.template];

  const sessionNo = meta.usesSessionNo ? await nextSessionNo(input.spaceId) : null;
  const title =
    input.title?.trim() ||
    meta.defaultTitle({ sessionNo: sessionNo ?? 1, today: new Date() });

  const content = buildTemplateDoc(input.template, sessionNo ?? 1);

  const [note] = await db
    .insert(notes)
    .values({
      spaceId: input.spaceId,
      title,
      template: input.template,
      content,
      plainText: docToPlainText(content),
      sessionNo,
      createdBy: userId,
      updatedBy: userId,
    })
    .returning();

  await db.insert(noteDocs).values({ noteId: note.id }).onConflictDoNothing();
  await db
    .update(spaces)
    .set({ lastActivityAt: new Date() })
    .where(eq(spaces.id, input.spaceId));

  redirect(`/s/${input.spaceId}/n/${note.id}`);
}

export async function renameNote(noteId: string, title: string) {
  const { note, userId } = await requireNoteAccess(noteId);
  const trimmed = title.trim();
  if (!trimmed) return;

  await db
    .update(notes)
    .set({ title: trimmed, updatedAt: new Date(), updatedBy: userId })
    .where(eq(notes.id, noteId));

  revalidatePath(`/s/${note.spaceId}/n/${noteId}`);
}

/**
 * 작성 중 ↔ 정리됨.
 * 정리됨으로 바꿔도 계속 편집할 수 있다. 목록에서 구분하기 위한 표시일 뿐이고
 * 누구나 바꾸고 되돌릴 수 있다. 확정·잠금 개념이 아니다.
 */
export async function setNoteStatus(noteId: string, status: NoteStatus) {
  const { note, userId } = await requireNoteAccess(noteId);

  await db
    .update(notes)
    .set({ status, updatedAt: new Date(), updatedBy: userId })
    .where(eq(notes.id, noteId));

  revalidatePath(`/s/${note.spaceId}`);
  revalidatePath(`/s/${note.spaceId}/n/${noteId}`);
}

/**
 * Yjs에서 파생된 Tiptap JSON 사본을 저장한다.
 * 진실의 원천은 note_docs.state이고, 이 값은 렌더·검색용이다.
 * 공동 편집 세션이 잠잠해질 때 디바운스해서 호출한다.
 */
export async function saveNoteContent(noteId: string, content: unknown) {
  const { note, userId } = await requireNoteAccess(noteId);

  await db
    .update(notes)
    .set({
      content: content as never,
      plainText: docToPlainText(content),
      updatedAt: new Date(),
      updatedBy: userId,
    })
    .where(eq(notes.id, noteId));

  await db
    .update(spaces)
    .set({ lastActivityAt: new Date() })
    .where(eq(spaces.id, note.spaceId));
}

/** 휴지통으로 보낸다. 30일 후 자동 삭제, 그 전에는 복원 가능. */
export async function trashNote(noteId: string) {
  const { note } = await requireNoteAccess(noteId);

  await db.update(notes).set({ deletedAt: new Date() }).where(eq(notes.id, noteId));

  revalidatePath(`/s/${note.spaceId}`);
  redirect(`/s/${note.spaceId}`);
}
