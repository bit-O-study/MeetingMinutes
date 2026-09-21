"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";

import { requireNoteAccess } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { spaceMembers, tasks } from "@/lib/db/schema";

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

  if (!row) throw new Error("접근할 수 없습니다.");

  // 완료한 항목은 되돌릴 수 있다.
  const doneAt = row.task.doneAt ? null : new Date();
  await db.update(tasks).set({ doneAt }).where(eq(tasks.id, taskId));

  revalidatePath("/tasks");
  revalidatePath(`/s/${row.task.spaceId}/n/${row.task.noteId}`);
  return { doneAt };
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
  const { note } = await requireNoteAccess(input.noteId);

  const [created] = await db
    .insert(tasks)
    .values({
      noteId: note.id,
      spaceId: note.spaceId,
      body: input.body,
      assigneeId: input.assigneeId ?? null,
      dueDate: input.dueDate ?? null,
      blockId: input.blockId ?? null,
    })
    .returning();

  revalidatePath(`/s/${note.spaceId}/n/${note.id}`);
  return created;
}

export async function updateTask(
  taskId: string,
  patch: { body?: string; assigneeId?: string | null; dueDate?: string | null },
) {
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

  if (!row) throw new Error("접근할 수 없습니다.");

  await db.update(tasks).set(patch).where(eq(tasks.id, taskId));

  revalidatePath("/tasks");
  revalidatePath(`/s/${row.task.spaceId}/n/${row.task.noteId}`);
}

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

  if (!row) throw new Error("접근할 수 없습니다.");

  await db.delete(tasks).where(eq(tasks.id, taskId));
  revalidatePath(`/s/${row.task.spaceId}/n/${row.task.noteId}`);
}

/** 노트의 할 일 목록. 편집 화면 우측 패널과 스페이스 할 일 탭이 함께 쓴다. */
export async function listNoteTasks(noteId: string) {
  await requireNoteAccess(noteId);
  return db.select().from(tasks).where(eq(tasks.noteId, noteId)).orderBy(tasks.sortOrder);
}

/** 노트를 삭제하면 그 노트의 할 일도 함께 사라진다(FK cascade). 삭제 전 확인할 것. */
export async function countNoteTasks(noteId: string) {
  const rows = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.noteId, noteId));
  return rows.length;
}
