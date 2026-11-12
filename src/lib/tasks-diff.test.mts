import assert from "node:assert/strict";
import { test } from "node:test";

import { diffDocTasks, parseDocTaskList } from "./tasks-diff.js";
import type { Task } from "./db/schema.js";

const NOW = new Date("2026-09-21T10:00:00Z");
const EARLIER = new Date("2026-09-20T10:00:00Z");

function task(over: Partial<Task> & { id: string }): Task {
  return {
    noteId: "n1",
    spaceId: "s1",
    body: "할 일",
    assigneeId: null,
    dueDate: null,
    doneAt: null,
    blockId: `b-${over.id}`,
    sortOrder: 0,
    createdAt: EARLIER,
    ...over,
  } as Task;
}

test("빈 체크박스는 할 일이 되지 않는다", () => {
  // 템플릿이 빈 항목을 달고 오므로, 노트를 열자마자 이름 없는 할 일이 생기면 안 된다.
  const d = diffDocTasks([], [{ blockId: "b1", body: "", checked: false }], [], NOW);
  assert.equal(d.inserts.length, 0);
});

test("내용을 적으면 할 일이 생긴다", () => {
  const d = diffDocTasks([], [{ blockId: "b1", body: "4장 읽기", checked: false }], [], NOW);
  assert.deepEqual(d.inserts, [
    { blockId: "b1", body: "4장 읽기", sortOrder: 0, doneAt: null },
  ]);
});

test("체크된 채로 생기면 완료 시각이 붙는다", () => {
  const d = diffDocTasks([], [{ blockId: "b1", body: "정리", checked: true }], [], NOW);
  assert.equal(d.inserts[0].doneAt, NOW);
});

const item = (blockId: string, checked = false, body = "할 일") => ({ blockId, body, checked });

test("문구를 고치면 반영된다", () => {
  const existing = [task({ id: "t1", body: "4장", blockId: "b1" })];
  const d = diffDocTasks(existing, [item("b1", false, "4장 읽고 정리")], [item("b1", false, "4장")], NOW);
  assert.deepEqual(d.updates, [{ id: "t1", patch: { body: "4장 읽고 정리" } }]);
});

test("문구를 다 지우면 옛 문구를 남기지 않고 비운다(행과 담당자는 유지)", () => {
  // 회귀: 빈 값을 무시해서 패널·목록에 지운 문구가 계속 남았다.
  const existing = [task({ id: "t1", body: "4장", blockId: "b1", assigneeId: "u1" })];
  const d = diffDocTasks(existing, [item("b1", false, "")], [item("b1", false, "4장")], NOW);
  assert.deepEqual(d.updates, [{ id: "t1", patch: { body: "" } }]);
  assert.equal(d.deleteIds.length, 0);
});

test("이 클라이언트가 체크하면 완료 시각이 붙는다", () => {
  const existing = [task({ id: "t1", blockId: "b1" })];
  const d = diffDocTasks(existing, [item("b1", true)], [item("b1", false)], NOW);
  assert.deepEqual(d.updates, [{ id: "t1", patch: { doneAt: NOW } }]);
});

test("이미 완료된 항목을 다시 체크해도 완료 시각을 덮어쓰지 않는다", () => {
  const existing = [task({ id: "t1", blockId: "b1", doneAt: EARLIER })];
  const d = diffDocTasks(existing, [item("b1", true)], [item("b1", false)], NOW);
  assert.equal(d.updates.length, 0);
});

test("이 클라이언트가 체크를 풀면 완료가 해제된다", () => {
  const existing = [task({ id: "t1", blockId: "b1", doneAt: EARLIER })];
  const d = diffDocTasks(existing, [item("b1", false)], [item("b1", true)], NOW);
  assert.deepEqual(d.updates, [{ id: "t1", patch: { doneAt: null } }]);
});

test("'내 할 일'에서 완료한 항목을 노트 편집이 되돌리지 않는다", () => {
  // 회귀: 노트를 열어 둔 사람의 본문엔 아직 미체크로 남아 있고, 그 사람이 다른 줄을
  // 고치면 전체 목록이 전송돼 DB의 완료가 풀렸다. 이 클라이언트는 체크 상태를 바꾸지 않았다.
  const existing = [task({ id: "t1", blockId: "b1", doneAt: EARLIER })];
  const d = diffDocTasks(
    existing,
    [item("b1", false), item("b2", false, "새 항목")],
    [item("b1", false)],
    NOW,
  );
  assert.equal(d.updates.length, 0);
  assert.equal(d.inserts.length, 1);
});

test("이 클라이언트가 알던 체크박스가 사라지면 할 일도 지운다", () => {
  const existing = [task({ id: "t1", blockId: "b1" }), task({ id: "t2", blockId: "b2" })];
  const d = diffDocTasks(existing, [item("b1")], [item("b1"), item("b2")], NOW);
  assert.deepEqual(d.deleteIds, ["t2"]);
});

test("모르는 할 일은 목록에 없어도 지우지 않는다(오래된 클라이언트)", () => {
  // 회귀: 재연결 전 문서를 가진 클라이언트가 남이 막 만든 할 일을 담당자·기한째 지웠다.
  const existing = [
    task({ id: "t1", blockId: "b1" }),
    task({ id: "t2", blockId: "b2", assigneeId: "u2", dueDate: "2026-10-30" }),
  ];
  const d = diffDocTasks(existing, [item("b1")], [item("b1")], NOW);
  assert.deepEqual(d.deleteIds, []);
});

test("빈 목록이 와도 previous에 없는 행은 지우지 않는다", () => {
  const existing = [task({ id: "t1", blockId: "b1" })];
  assert.deepEqual(diffDocTasks(existing, [], [], NOW).deleteIds, []);
});

test("blockId 없는 행은 본문과 무관하므로 건드리지 않는다", () => {
  const existing = [task({ id: "t1", blockId: null })];
  const d = diffDocTasks(existing, [], [item("x")], NOW);
  assert.deepEqual(d.deleteIds, []);
});

test("순서가 바뀌면 sortOrder를 맞춘다", () => {
  const existing = [
    task({ id: "t1", blockId: "b1", sortOrder: 0 }),
    task({ id: "t2", blockId: "b2", sortOrder: 1 }),
  ];
  const d = diffDocTasks(existing, [item("b2"), item("b1")], [item("b1"), item("b2")], NOW);
  assert.deepEqual(d.updates, [
    { id: "t2", patch: { sortOrder: 0 } },
    { id: "t1", patch: { sortOrder: 1 } },
  ]);
});

test("변경이 없으면 아무 일도 하지 않는다", () => {
  // 공동 편집에서 같은 동기화가 여러 번 불릴 수 있다. 재실행이 안전해야 한다.
  const existing = [task({ id: "t1", blockId: "b1", body: "할 일", sortOrder: 0 })];
  const items = [item("b1")];
  const a = diffDocTasks(existing, items, items, NOW);
  const b = diffDocTasks(existing, items, items, NOW);
  assert.deepEqual(a, { inserts: [], updates: [], deleteIds: [] });
  assert.deepEqual(a, b);
});

test("입력 검증: 형식이 틀리면 던지고, 중복 blockId는 앞의 것만 쓴다", () => {
  assert.throws(() => parseDocTaskList("x"));
  assert.throws(() => parseDocTaskList([{ blockId: "", body: "a", checked: false }]));
  assert.throws(() => parseDocTaskList([{ blockId: "b", body: 1, checked: false }]));
  assert.throws(() => parseDocTaskList([{ blockId: "b", body: "a", checked: "yes" }]));
  assert.throws(() => parseDocTaskList([{ blockId: "b".repeat(65), body: "a", checked: false }]));
  assert.deepEqual(
    parseDocTaskList([
      { blockId: "b", body: " a ", checked: true, extra: 1 },
      { blockId: "b", body: "dup", checked: false },
    ]),
    [{ blockId: "b", body: "a", checked: true }],
  );
});
