"use server";

import { notFound } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";

import { requireNoteAccess } from "@/lib/access";
import { taskPatchInput } from "@/lib/action-input";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { spaceMembers, tasks } from "@/lib/db/schema";
import { diffDocTasks, parseDocTaskList } from "@/lib/tasks-diff";

/**
 * 할 일은 한 곳에만 저장된다.
 * 본문 체크박스와 우측 패널은 같은 레코드를 본다 — blockId가 연결 고리다.
 * 두 벌로 관리하면 반드시 어긋난다.
 *
 * ── revalidatePath를 부르지 않는 이유 ─────────────────────────
 * 서버 액션에서 revalidatePath를 부르면 호출한 화면의 페이지·레이아웃이 통째로 다시
 * 렌더된다. 노트 편집 중 할 일 동기화는 몇 초마다 일어나서, 그때마다 노트 페이지
 * 전체(멤버·할 일 조회 포함)를 다시 그리고 있었다. 할 일 목록은 액션이 돌려준 값으로
 * 패널이 직접 그리고, '내 할 일'·홈은 요청마다 새로 읽는 동적 화면이라 무효화할 캐시가 없다.
 */

/** 완료 여부 값을 확인한다. "뒤집기"가 아니라 목표 상태를 받는다 — 두 번 눌려도 결과가 같다. */
function assertDone(done: unknown): asserts done is boolean {
  if (typeof done !== "boolean") throw new Error("완료 여부가 올바르지 않습니다.");
}

/** '내 할 일'·프로젝트 할 일 탭의 체크. 같은 요청이 두 번 와도 결과가 같다. */
export async function toggleTask(taskId: string, done: boolean) {
  assertDone(done);
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

  // 이미 그 상태면 완료 시각을 덮어쓰지 않는다.
  if (Boolean(row.task.doneAt) === done) return { doneAt: row.task.doneAt };
  const doneAt = done ? new Date() : null;
  await db.update(tasks).set({ doneAt }).where(eq(tasks.id, taskId));
  return { doneAt };
}

/**
 * 담당자는 그 프로젝트 멤버여야 한다. 아니면 본인 할 일 목록에서 볼 수 없어서
 * 아무도 못 보는 할 일이 된다. 고치는 쪽에 같은 규칙을 건다.
 */
async function assertAssignable(spaceId: string, assigneeId: string) {
  const [member] = await db
    .select({ userId: spaceMembers.userId })
    .from(spaceMembers)
    .where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, assigneeId)))
    .limit(1);

  if (!member) throw new Error("이 프로젝트의 멤버가 아닙니다.");
}

/**
 * 담당자·기한을 바꾼다. 둘 다 선택 사항이다 —
 * 스터디의 "다음까지 4장 읽기"는 전원 대상이라 담당자가 없다.
 * 담당자를 비우면 프로젝트 공용 할 일이 된다.
 *
 * 갱신된 목록을 돌려준다. 패널이 바로 다시 그릴 수 있어야 한다.
 */
export async function updateTask(
  taskId: string,
  patch: { body?: string; assigneeId?: string | null; dueDate?: string | null },
) {
  // 파싱한 값만 쓴다. patch를 그대로 set()에 넘기면 noteId·spaceId 같은
  // 실제 컬럼명이 전부 통과해서, 할 일을 남의 프로젝트로 옮길 수 있다.
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

  return listTasksOf(row.task.noteId);
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
  return listTasksOf(row.task.noteId);
}

function listTasksOf(noteId: string) {
  return db.select().from(tasks).where(eq(tasks.noteId, noteId)).orderBy(tasks.sortOrder);
}

/**
 * 노트의 할 일 목록. 노트 편집 화면이 다시 보일 때(다른 탭·'내 할 일'에서 돌아올 때)
 * 패널과 본문 체크 상태를 DB에 맞추는 데 쓴다.
 */
export async function listNoteTasks(noteId: string) {
  await requireNoteAccess(noteId);
  return listTasksOf(noteId);
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
 * **완료 여부**는 양쪽에 있다. 본문 체크는 **이 클라이언트가 바꾼 경우에만** DB에 쓴다.
 * 그래야 '내 할 일'에서 완료한 것을 노트를 열어 둔 사람의 편집이 되돌리지 않는다.
 *
 * `previous`는 호출한 클라이언트가 직전에 알던 목록이다. 삭제와 완료 변경은 그 차이로만
 * 일어난다(tasks-diff.ts). 오래된 클라이언트가 모르는 남의 할 일을 지우지 못한다.
 *
 * 이 함수는 여러 번 불려도 같은 결과를 낸다. 공동 편집 중
 * 변경을 일으킨 클라이언트만 호출하지만, 재시도가 안전해야 한다.
 */
export async function syncNoteTasks(noteId: string, items: unknown, previous: unknown) {
  // TODO: action-input.ts에 syncNoteTasks용 zod 스키마가 생기면 그쪽으로 바꾼다.
  // 지금은 tasks-diff.ts의 수동 검증을 쓴다(같은 규칙: blockId ≤64, 문구 ≤2000, 항목 ≤2000).
  const current = parseDocTaskList(items, "items");
  const known = parseDocTaskList(previous, "previous");
  const { note } = await requireNoteAccess(noteId);

  return db.transaction(async (tx) => {
    const existing = await tx.select().from(tasks).where(eq(tasks.noteId, noteId));
    const diff = diffDocTasks(existing, current, known);
    if (!diff.updates.length && !diff.inserts.length && !diff.deleteIds.length) {
      return existing.sort((a, b) => a.sortOrder - b.sortOrder);
    }

    for (const { id, patch } of diff.updates) {
      await tx.update(tasks).set(patch).where(eq(tasks.id, id));
    }

    if (diff.inserts.length > 0) {
      await tx
        .insert(tasks)
        .values(diff.inserts.map((row) => ({ ...row, noteId, spaceId: note.spaceId })))
        .onConflictDoNothing();
    }

    if (diff.deleteIds.length > 0) {
      await tx.delete(tasks).where(inArray(tasks.id, diff.deleteIds));
    }

    return tx.select().from(tasks).where(eq(tasks.noteId, noteId)).orderBy(tasks.sortOrder);
  });
}

/**
 * 패널에서 완료를 눌렀을 때. 본문 체크박스도 함께 바꿔야 하므로
 * 갱신된 목록을 돌려준다. 본문 쪽은 호출한 클라이언트가 맞춘다.
 * 뒤집기가 아니라 목표 상태를 받는다 — 빠르게 두 번 눌러도 엉뚱한 상태가 되지 않는다.
 */
export async function toggleTaskInNote(noteId: string, taskId: string, done: boolean) {
  assertDone(done);
  await requireNoteAccess(noteId);

  const [row] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (!row || row.noteId !== noteId) notFound();

  if (Boolean(row.doneAt) !== done) {
    await db
      .update(tasks)
      .set({ doneAt: done ? new Date() : null })
      .where(eq(tasks.id, taskId));
  }

  return listTasksOf(noteId);
}
