import type { Task } from "@/lib/db/schema";

/**
 * 본문 체크박스와 tasks 행의 차이를 계산한다.
 *
 * 권한 검사·DB 접근에서 떼어 낸 순수 함수다. 규칙이 미묘해서
 * (빈 항목 무시, 완료 시각 보존, 고아 정리) 눈으로만 확인하기 어렵다.
 */

export type DocTaskInput = { blockId: string; body: string; checked: boolean };

export type TaskDiff = {
  inserts: { blockId: string; body: string; sortOrder: number; doneAt: Date | null }[];
  updates: { id: string; patch: Partial<Pick<Task, "body" | "sortOrder" | "doneAt">> }[];
  deleteIds: string[];
};

export function diffDocTasks(
  existing: Task[],
  items: DocTaskInput[],
  now: Date = new Date(),
): TaskDiff {
  const byBlock = new Map(
    existing.filter((t) => t.blockId).map((t) => [t.blockId as string, t]),
  );

  const diff: TaskDiff = { inserts: [], updates: [], deleteIds: [] };
  const seen = new Set<string>();

  for (const [index, item] of items.entries()) {
    seen.add(item.blockId);
    const row = byBlock.get(item.blockId);

    if (!row) {
      // 빈 체크박스는 아직 할 일이 아니다. 템플릿이 빈 항목을 달고 오는데
      // 그대로 만들면 노트를 열자마자 이름 없는 할 일이 생긴다.
      if (!item.body) continue;

      diff.inserts.push({
        blockId: item.blockId,
        body: item.body,
        sortOrder: index,
        doneAt: item.checked ? now : null,
      });
      continue;
    }

    const patch: TaskDiff["updates"][number]["patch"] = {};

    // 본문을 통째로 지우는 중일 수 있으므로 빈 문자열로는 덮어쓰지 않는다.
    if (item.body && row.body !== item.body) patch.body = item.body;
    if (row.sortOrder !== index) patch.sortOrder = index;

    // 이미 완료된 항목을 다시 체크해도 완료 시각을 덮어쓰지 않는다.
    const wasDone = Boolean(row.doneAt);
    if (wasDone !== item.checked) patch.doneAt = item.checked ? now : null;

    if (Object.keys(patch).length > 0) diff.updates.push({ id: row.id, patch });
  }

  // 본문에서 사라진 체크박스는 할 일도 지운다.
  // blockId가 없는 행은 본문과 무관하게 만들어진 것이므로 건드리지 않는다.
  for (const row of existing) {
    if (row.blockId && !seen.has(row.blockId)) diff.deleteIds.push(row.id);
  }

  return diff;
}
