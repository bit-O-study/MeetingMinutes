import assert from "node:assert/strict";
import { test } from "node:test";

import { diffDocTasks } from "./tasks-diff.js";
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
  const d = diffDocTasks([], [{ blockId: "b1", body: "", checked: false }], NOW);
  assert.equal(d.inserts.length, 0);
});

test("내용을 적으면 할 일이 생긴다", () => {
  const d = diffDocTasks([], [{ blockId: "b1", body: "4장 읽기", checked: false }], NOW);
  assert.deepEqual(d.inserts, [
    { blockId: "b1", body: "4장 읽기", sortOrder: 0, doneAt: null },
  ]);
});

test("체크된 채로 생기면 완료 시각이 붙는다", () => {
  const d = diffDocTasks([], [{ blockId: "b1", body: "정리", checked: true }], NOW);
  assert.equal(d.inserts[0].doneAt, NOW);
});

test("문구를 고치면 반영된다", () => {
  const existing = [task({ id: "t1", body: "4장", blockId: "b1" })];
  const d = diffDocTasks(existing, [{ blockId: "b1", body: "4장 읽고 정리", checked: false }], NOW);
  assert.deepEqual(d.updates, [{ id: "t1", patch: { body: "4장 읽고 정리" } }]);
});

test("본문을 지우는 중에는 빈 문자열로 덮어쓰지 않는다", () => {
  const existing = [task({ id: "t1", body: "4장", blockId: "b1" })];
  const d = diffDocTasks(existing, [{ blockId: "b1", body: "", checked: false }], NOW);
  assert.equal(d.updates.length, 0);
  assert.equal(d.deleteIds.length, 0);
});

test("체크하면 완료 시각이 붙는다", () => {
  const existing = [task({ id: "t1", blockId: "b1" })];
  const d = diffDocTasks(existing, [{ blockId: "b1", body: "할 일", checked: true }], NOW);
  assert.deepEqual(d.updates, [{ id: "t1", patch: { doneAt: NOW } }]);
});

test("이미 완료된 항목을 다시 체크해도 완료 시각을 덮어쓰지 않는다", () => {
  const existing = [task({ id: "t1", blockId: "b1", doneAt: EARLIER })];
  const d = diffDocTasks(existing, [{ blockId: "b1", body: "할 일", checked: true }], NOW);
  assert.equal(d.updates.length, 0);
});

test("체크를 풀면 완료가 해제된다", () => {
  const existing = [task({ id: "t1", blockId: "b1", doneAt: EARLIER })];
  const d = diffDocTasks(existing, [{ blockId: "b1", body: "할 일", checked: false }], NOW);
  assert.deepEqual(d.updates, [{ id: "t1", patch: { doneAt: null } }]);
});

test("본문에서 사라진 체크박스는 할 일도 지운다", () => {
  const existing = [task({ id: "t1", blockId: "b1" }), task({ id: "t2", blockId: "b2" })];
  const d = diffDocTasks(existing, [{ blockId: "b1", body: "할 일", checked: false }], NOW);
  assert.deepEqual(d.deleteIds, ["t2"]);
});

test("blockId 없는 행은 본문과 무관하므로 건드리지 않는다", () => {
  const existing = [task({ id: "t1", blockId: null })];
  const d = diffDocTasks(existing, [], NOW);
  assert.deepEqual(d.deleteIds, []);
});

test("순서가 바뀌면 sortOrder를 맞춘다", () => {
  const existing = [
    task({ id: "t1", blockId: "b1", sortOrder: 0 }),
    task({ id: "t2", blockId: "b2", sortOrder: 1 }),
  ];
  const d = diffDocTasks(
    existing,
    [
      { blockId: "b2", body: "할 일", checked: false },
      { blockId: "b1", body: "할 일", checked: false },
    ],
    NOW,
  );
  assert.deepEqual(d.updates, [
    { id: "t2", patch: { sortOrder: 0 } },
    { id: "t1", patch: { sortOrder: 1 } },
  ]);
});

test("변경이 없으면 아무 일도 하지 않는다", () => {
  // 공동 편집에서 같은 동기화가 여러 번 불릴 수 있다. 재실행이 안전해야 한다.
  const existing = [task({ id: "t1", blockId: "b1", body: "할 일", sortOrder: 0 })];
  const items = [{ blockId: "b1", body: "할 일", checked: false }];
  const a = diffDocTasks(existing, items, NOW);
  const b = diffDocTasks(existing, items, NOW);
  assert.deepEqual(a, { inserts: [], updates: [], deleteIds: [] });
  assert.deepEqual(a, b);
});
