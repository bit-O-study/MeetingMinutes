"use server";

import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";

import { requireNoteAccess } from "@/lib/access";
import { createTaskInput, taskPatchInput } from "@/lib/action-input";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { spaceMembers, tasks } from "@/lib/db/schema";
import { diffDocTasks, type DocTaskInput } from "@/lib/tasks-diff";

/**
 * 할 일은 한 곳에만 저장된다.
 * 본문 체크박스와 우측 패널은 같은 레코드를 본다 — blockId가 연결 고리다.
 * 두 벌로 관리하면 반드시 어긋난다.
 */

export async function toggleTask(taskId: string) {
  const user = await requireUser();

  const [row] = await db
    .select({ task: tasks })
    .from(tasks)
    .innerJoin(
      spaceMembers,
      and(eq(spaceMembers.spaceId, tasks.spaceId), eq(spaceMembers.userId, user.id)),
    )
    .where(eq(tasks.id, taskId))
    .limit(1);

  if (!row) notFound();
  await requireNoteAccess(row.task.noteId);

  // 완료한 항목은 되돌릴 수 있다.
  const doneAt = row.task.doneAt ? null : new Date();
  await db.update(tasks).set({ doneAt }).where(eq(tasks.id, taskId));

  revalidatePath("/tasks");
  revalidatePath(`/s/${row.task.spaceId}/n/${row.task.noteId}`);
  return { doneAt };
}

/**
 * 담당자는 그 스페이스 멤버여야 한다. 아니면 본인 할 일 목록에서 볼 수 없어서
 * 아무도 못 보는 할 일이 된다. 만드는 쪽과 고치는 쪽에 같은 규칙을 건다.
 */
async function assertAssignable(spaceId: string, assigneeId: string) {
  const [member] = await db
    .select({ userId: spaceMembers.userId })
    .from(spaceMembers)
    .where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, assigneeId)))
    .limit(1);

  if (!member) throw new Error("이 스페이스의 멤버가 아닙니다.");
}

export async function createTask(input: {
  noteId: string;
  body: string;
  /** null이면 스페이스 공용 할 일 */
  assigneeId?: string | null;
  /** Asia/Seoul 기준 YYYY-MM-DD */
  dueDate?: string | null;
  /** 본문 체크박스 노드 id */
  blockId?: string | null;
}) {
  const parsed = createTaskInput.parse(input);
  const { note } = await requireNoteAccess(parsed.noteId);
  if (parsed.assigneeId) await assertAssignable(note.spaceId, parsed.assigneeId);

  const [created] = await db
    .insert(tasks)
    .values({
      noteId: note.id,
      spaceId: note.spaceId,
      body: parsed.body,
      assigneeId: parsed.assigneeId ?? null,
      dueDate: parsed.dueDate ?? null,
      blockId: parsed.blockId ?? null,
    })
    .returning();

  revalidatePath(`/s/${note.spaceId}/n/${note.id}`);
  return created;
}

/**
 * 담당자·기한을 바꾼다. 둘 다 선택 사항이다 —
 * 스터디의 "다음까지 4장 읽기"는 전원 대상이라 담당자가 없다.
 * 담당자를 비우면 스페이스 공용 할 일이 된다.
 *
 * 갱신된 목록을 돌려준다. 패널이 바로 다시 그릴 수 있어야 한다.
 */
export async function updateTask(
  taskId: string,
  patch: { body?: string; assigneeId?: string | null; dueDate?: string | null },
) {
  // 파싱한 값만 쓴다. patch를 그대로 set()에 넘기면 noteId·spaceId 같은
  // 실제 컬럼명이 전부 통과해서, 할 일을 남의 스페이스로 옮길 수 있다.
  const fields = taskPatchInput.parse(patch);
  const user = await requireUser();

  const [row] = await db
    .select({ task: tasks })
    .from(tasks)
    .innerJoin(
      spaceMembers,
      and(eq(spaceMembers.spaceId, tasks.spaceId), eq(spaceMembers.userId, user.id)),
    )
    .where(eq(tasks.id, taskId))
    .limit(1);

  if (!row) notFound();
  await requireNoteAccess(row.task.noteId);

  if (fields.assigneeId) await assertAssignable(row.task.spaceId, fields.assigneeId);

  await db.update(tasks).set(fields).where(eq(tasks.id, taskId));

  revalidatePath("/tasks");
  revalidatePath(`/s/${row.task.spaceId}/n/${row.task.noteId}`);

  return db
    .select()
    .from(tasks)
    .where(eq(tasks.noteId, row.task.noteId))
    .orderBy(tasks.sortOrder);
}

/**
 * 할 일을 지운다.
 *
 * 본문 체크박스와 이어진 항목이라면 다음 동기화 때 되살아난다 —
 * 존재는 본문이 정하기 때문이다. 지우려면 본문에서 체크박스를 지워야 한다.
 * 그래서 패널에서는 blockId가 없는 항목에만 삭제를 노출한다.
 */
export async function deleteTask(taskId: string) {
  const user = await requireUser();

  const [row] = await db
    .select({ task: tasks })
    .from(tasks)
    .innerJoin(
      spaceMembers,
      and(eq(spaceMembers.spaceId, tasks.spaceId), eq(spaceMembers.userId, user.id)),
    )
    .where(eq(tasks.id, taskId))
    .limit(1);

  if (!row) notFound();
  await requireNoteAccess(row.task.noteId);

  await db.delete(tasks).where(eq(tasks.id, taskId));
  revalidatePath("/tasks");
  revalidatePath(`/s/${row.task.spaceId}/n/${row.task.noteId}`);

  return db
    .select()
    .from(tasks)
    .where(eq(tasks.noteId, row.task.noteId))
    .orderBy(tasks.sortOrder);
}

/** 노트의 할 일 목록. 편집 화면 우측 패널과 스페이스 할 일 탭이 함께 쓴다. */
export async function listNoteTasks(noteId: string) {
  await requireNoteAccess(noteId);
  return db.select().from(tasks).where(eq(tasks.noteId, noteId)).orderBy(tasks.sortOrder);
}

/** 노트를 삭제하면 그 노트의 할 일도 함께 사라진다(FK cascade). 삭제 전 확인할 것. */
export async function countNoteTasks(noteId: string) {
  // 개수도 정보다. 검사 없이 두면 노트의 존재 여부가 새어 나간다 — 설계 원칙 6.
  await requireNoteAccess(noteId);
  const rows = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.noteId, noteId));
  return rows.length;
}

/* ────────────────────────────────────────────────────────────
   본문 ↔ tasks 동기화
   ──────────────────────────────────────────────────────────── */

/**
 * 본문의 체크박스 목록을 받아 tasks를 맞춘다.
 *
 * ── 진실의 원천을 어떻게 나눴나 ────────────────────────────
 * 체크박스의 **존재와 문구**는 본문이 정한다. 사람이 문서를 고치는 것이
 * 자연스러운 흐름이고, 본문에서 지운 항목이 목록에 남아 있으면 혼란스럽다.
 * **담당자·기한**은 tasks에만 있다. 본문에 적을 자리가 없다.
 * **완료 여부**는 양쪽에 있고, 편집 중에는 본문이 이긴다. 노트를 열 때
 * DB 값으로 한 번 맞춰 주므로(reconcile) 내 할 일 화면에서 체크한 것도 반영된다.
 *
 * 이 함수는 여러 번 불려도 같은 결과를 낸다. 공동 편집 중
 * 변경을 일으킨 클라이언트만 호출하지만, 재시도가 안전해야 한다.
 */
export async function syncNoteTasks(noteId: string, items: DocTaskInput[]) {
  const { note } = await requireNoteAccess(noteId);

  const existing = await db.select().from(tasks).where(eq(tasks.noteId, noteId));
  const diff = diffDocTasks(existing, items);

  for (const { id, patch } of diff.updates) {
    await db.update(tasks).set(patch).where(eq(tasks.id, id));
  }

  if (diff.inserts.length > 0) {
    await db
      .insert(tasks)
      .values(diff.inserts.map((row) => ({ ...row, noteId, spaceId: note.spaceId })))
      .onConflictDoNothing();
  }

  if (diff.deleteIds.length > 0) {
    await db.delete(tasks).where(inArray(tasks.id, diff.deleteIds));
  }

  revalidatePath("/tasks");

  return db.select().from(tasks).where(eq(tasks.noteId, noteId)).orderBy(tasks.sortOrder);
}

/**
 * 패널에서 완료를 눌렀을 때. 본문 체크박스도 함께 바꿔야 하므로
 * 갱신된 목록을 돌려준다. 본문 쪽은 호출한 클라이언트가 맞춘다.
 */
export async function toggleTaskInNote(noteId: string, taskId: string) {
  await requireNoteAccess(noteId);

  const [row] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (!row || row.noteId !== noteId) notFound();

  await db
    .update(tasks)
    .set({ doneAt: row.doneAt ? null : new Date() })
    .where(eq(tasks.id, taskId));

  revalidatePath("/tasks");

  return db.select().from(tasks).where(eq(tasks.noteId, noteId)).orderBy(tasks.sortOrder);
}
