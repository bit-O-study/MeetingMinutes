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

/**
 * @param items    지금 본문의 체크박스 목록
 * @param previous 이 클라이언트가 **직전에 알고 있던** 목록(마지막으로 동기화했거나 DB에서 맞춘 상태).
 *
 * ── previous가 필요한 이유 ──────────────────────────────────
 * 본문 전체를 "정답"으로 보고 DB를 맞추면, 이 클라이언트가 모르는 사이에 바뀐 값을
 * 되돌리게 된다.
 *   · 다른 사람이 '내 할 일'에서 완료한 항목 → 노트를 열어 둔 사람이 한 글자만 쳐도 미완료로 되돌아갔다.
 *   · 오래된(재연결 전) 클라이언트가 보낸 목록에 없는 남의 항목 → 담당자·기한과 함께 지워졌다.
 * 그래서 **이 클라이언트가 실제로 바꾼 것**(previous → items의 차이)만 반영한다.
 *   · 완료 여부: previous와 items에서 체크 상태가 달라진 항목만 바꾼다.
 *   · 삭제: previous에 있었는데 items에서 사라진 항목만 지운다.
 *   · 문구·순서: 본문이 정하므로 그대로 따른다(Yjs로 이미 수렴한 값이다).
 */
export function diffDocTasks(
  existing: Task[],
  items: DocTaskInput[],
  previous: DocTaskInput[],
  now: Date = new Date(),
): TaskDiff {
  const byBlock = new Map(
    existing.filter((t) => t.blockId).map((t) => [t.blockId as string, t]),
  );
  const before = new Map(previous.map((item) => [item.blockId, item]));

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

    // 문구를 다 지우면 빈 문구로 맞춘다. 예전에는 빈 값을 무시해서 패널과 목록에
    // 지운 옛 문구가 계속 남았다. 행은 지우지 않는다 — 다시 쓰는 중일 수 있고,
    // 지우면 담당자·기한이 함께 사라진다. 화면은 빈 문구를 "내용 없음"으로 그린다.
    if (row.body !== item.body) patch.body = item.body;
    if (row.sortOrder !== index) patch.sortOrder = index;

    // 완료 여부는 이 클라이언트가 바꾼 경우에만 따른다(위 설명).
    // 이미 완료된 항목을 다시 체크해도 완료 시각을 덮어쓰지 않는다.
    const known = before.get(item.blockId);
    const changedHere = known !== undefined && known.checked !== item.checked;
    const wasDone = Boolean(row.doneAt);
    if (changedHere && wasDone !== item.checked) patch.doneAt = item.checked ? now : null;

    if (Object.keys(patch).length > 0) diff.updates.push({ id: row.id, patch });
  }

  // 이 클라이언트가 알던 체크박스 중 본문에서 사라진 것만 지운다.
  // 모르는 행(다른 사람이 방금 만든 것, 이 클라이언트가 아직 못 받은 것)은 건드리지 않는다.
  // blockId가 없는 행은 본문과 무관하게 만들어진 것이므로 역시 건드리지 않는다.
  for (const row of existing) {
    if (row.blockId && !seen.has(row.blockId) && before.has(row.blockId)) diff.deleteIds.push(row.id);
  }

  return diff;
}

/* ────────────────────────────────────────────────────────────
   입력 검증
   ──────────────────────────────────────────────────────────── */

const MAX_ITEMS = 2000;
const MAX_BLOCK_ID = 64;
const MAX_BODY = 2000;

export class InvalidTaskSyncError extends Error {
  constructor(reason: string) {
    super(`할 일 동기화 입력이 올바르지 않습니다: ${reason}`);
    this.name = "InvalidTaskSyncError";
  }
}

/**
 * 서버 액션이 받은 체크박스 목록을 검증한다. 네트워크 경계라 타입을 믿을 수 없다.
 *
 * zod 스키마(action-input.ts)가 생기기 전까지 쓰는 수동 검증이다. 이 파일은 클라이언트도
 * 타입을 가져다 쓰므로 zod를 import 하지 않는다 — 노트 편집 번들에 zod가 딸려 온다.
 * 같은 blockId가 두 번 오면 앞의 것만 쓴다(본문 순서가 sortOrder이므로).
 */
export function parseDocTaskList(value: unknown, field = "items"): DocTaskInput[] {
  if (!Array.isArray(value)) throw new InvalidTaskSyncError(`${field}가 배열이 아닙니다.`);
  if (value.length > MAX_ITEMS) throw new InvalidTaskSyncError(`${field}가 너무 많습니다.`);

  const out: DocTaskInput[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (!raw || typeof raw !== "object") throw new InvalidTaskSyncError(`${field} 항목 형식이 아닙니다.`);
    const { blockId, body, checked } = raw as Record<string, unknown>;
    if (typeof blockId !== "string" || blockId.length === 0 || blockId.length > MAX_BLOCK_ID) {
      throw new InvalidTaskSyncError("blockId가 올바르지 않습니다.");
    }
    if (typeof body !== "string" || body.length > MAX_BODY) throw new InvalidTaskSyncError("문구가 올바르지 않습니다.");
    if (typeof checked !== "boolean") throw new InvalidTaskSyncError("체크 상태가 올바르지 않습니다.");
    if (seen.has(blockId)) continue;
    seen.add(blockId);
    out.push({ blockId, body: body.trim(), checked });
  }
  return out;
}
