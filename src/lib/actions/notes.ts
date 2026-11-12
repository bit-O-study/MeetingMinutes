"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, isNull, sql } from "drizzle-orm";

import { requireNoteAccess, requireSpaceMember } from "@/lib/access";
import { assertNoteDoc } from "@/lib/action-input";
import { db } from "@/lib/db";
import { noteDocs, notes, spaces } from "@/lib/db/schema";
import type { NoteStatus, TemplateKind } from "@/lib/db/schema";
import { TEMPLATES, buildTemplateDoc, docToPlainText, resolveNoteTitle } from "@/lib/templates";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** 다음 회차 번호. 스터디는 회차가 규칙적이라 제목을 미리 채워 준다. */
async function nextSessionNo(conn: typeof db | Tx, spaceId: string): Promise<number> {
  const [last] = await conn
    .select({ n: notes.sessionNo })
    .from(notes)
    .where(and(eq(notes.spaceId, spaceId), eq(notes.template, "study"), isNull(notes.deletedAt)))
    .orderBy(sql`${notes.sessionNo} desc nulls last`)
    .limit(1);
  return (last?.n ?? 0) + 1;
}

function assertTemplate(template: unknown): asserts template is TemplateKind {
  if (typeof template !== "string" || !Object.hasOwn(TEMPLATES, template)) {
    throw new Error("노트 양식이 올바르지 않습니다.");
  }
}

export async function suggestNoteTitle(spaceId: string, template: TemplateKind) {
  assertTemplate(template);
  await requireSpaceMember(spaceId);
  const meta = TEMPLATES[template];
  const sessionNo = meta.usesSessionNo ? await nextSessionNo(db, spaceId) : 1;
  return { title: meta.defaultTitle({ sessionNo, today: new Date() }), sessionNo };
}

export async function createNote(input: {
  spaceId: string;
  template: TemplateKind;
  title?: string;
}) {
  assertTemplate(input.template);
  const { userId } = await requireSpaceMember(input.spaceId);
  const meta = TEMPLATES[input.template];
  const requested = typeof input.title === "string" ? input.title : "";

  /*
    회차 번호는 "마지막 번호 + 1"이라, 두 사람이 동시에 만들면 같은 번호가 둘 생겼다.
    프로젝트별 advisory lock을 트랜잭션 동안 잡아 번호 계산과 삽입을 한 줄로 세운다.
    xact 잠금이라 커밋·롤백 때 저절로 풀린다(풀러 트랜잭션 모드에서도 안전하다).
    노트·문서 행·활동 시각도 같은 트랜잭션으로 묶는다 — 중간에 실패하면 문서 행 없는 노트가 남았다.
  */
  const note = await db.transaction(async (tx) => {
    let sessionNo: number | null = null;
    if (meta.usesSessionNo) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"notes.session_no:" + input.spaceId}))`);
      sessionNo = await nextSessionNo(tx, input.spaceId);
    }

    const title = resolveNoteTitle(input.template, requested, sessionNo ?? 1, new Date());
    const content = buildTemplateDoc(input.template, sessionNo ?? 1);

    const [created] = await tx
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

    await tx.insert(noteDocs).values({ noteId: created.id }).onConflictDoNothing();
    await tx
      .update(spaces)
      .set({ lastActivityAt: new Date() })
      .where(eq(spaces.id, input.spaceId));
    return created;
  });

  redirect(`/s/${input.spaceId}/n/${note.id}`);
}

export async function renameNote(noteId: string, title: string) {
  const { note, userId } = await requireNoteAccess(noteId);
  const trimmed = typeof title === "string" ? title.trim().slice(0, 200) : "";
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
  if (status !== "draft" && status !== "tidied") throw new Error("노트 상태가 올바르지 않습니다.");
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
  // 에디터가 보낸 값이라도 액션은 네트워크 경계다. 모양과 크기만 확인한다 —
  // 노드 종류까지 묶으면 확장을 더할 때마다 멀쩡한 편집이 저장되지 않는다.
  const doc = assertNoteDoc(content);

  await db
    .update(notes)
    .set({
      content: doc as never,
      plainText: docToPlainText(doc),
      updatedAt: new Date(),
      updatedBy: userId,
    })
    .where(eq(notes.id, noteId));

  await db
    .update(spaces)
    .set({ lastActivityAt: new Date() })
    .where(eq(spaces.id, note.spaceId));
}

/**
 * 노트를 지운다(deleted_at 표시). 목록·검색·할 일에서 모두 빠진다.
 *
 * 휴지통 화면·복원·30일 뒤 정리는 아직 없다. 화면 문구도 "삭제(복구 불가)"로 맞춰 두었다 —
 * 복원 화면을 만들면 그때 "휴지통" 문구로 되돌린다.
 */
export async function trashNote(noteId: string) {
  const { note } = await requireNoteAccess(noteId);

  await db.update(notes).set({ deletedAt: new Date() }).where(eq(notes.id, noteId));

  revalidatePath(`/s/${note.spaceId}`);
  redirect(`/s/${note.spaceId}`);
}
