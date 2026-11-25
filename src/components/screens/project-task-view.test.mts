import { test } from "node:test";
import assert from "node:assert/strict";
import { filterProjectTasks, projectTaskFilter } from "./project-task-view";

const rows = [
  { id: "mine-open", assigneeId: "me-id", done: false },
  { id: "mine-done", assigneeId: "me-id", done: true },
  { id: "shared", assigneeId: null, done: false },
  { id: "other", assigneeId: "other-id", done: false },
];

test("내 담당과 미지정 조건은 다른 담당자의 할 일을 섞지 않는다", () => {
  assert.deepEqual(filterProjectTasks(rows, { assignee: "me", state: "all" }, "me-id").map(row => row.id), ["mine-open", "mine-done"]);
  assert.deepEqual(filterProjectTasks(rows, { assignee: "unassigned", state: "open" }, "me-id").map(row => row.id), ["shared"]);
  assert.deepEqual(filterProjectTasks(rows, { assignee: "other-id", state: "all" }, "me-id").map(row => row.id), ["other"]);
});

test("담당자와 완료 조건을 함께 적용하고 갱신된 완료 결과를 따른다", () => {
  const filter = { assignee: "me", state: "open" as const };
  assert.deepEqual(filterProjectTasks(rows, filter, "me-id").map(row => row.id), ["mine-open"]);
  const updated = rows.map(row => row.id === "mine-open" ? { ...row, done: true } : row);
  assert.deepEqual(filterProjectTasks(updated, filter, "me-id"), []);
  assert.deepEqual(filterProjectTasks(rows, { assignee: "me", state: "done" }, "me-id").map(row => row.id), ["mine-done"]);
});

test("알 수 없는 담당자는 전체 결과로 확대하지 않는다", () => {
  assert.deepEqual(filterProjectTasks(rows, { assignee: "unknown", state: "all" }, "me-id"), []);
});

test("잘못된 상태와 중복 쿼리 값은 기본 필터로 해석한다", () => {
  assert.deepEqual(projectTaskFilter({ assignee: ["me", "unassigned"], taskState: "overdue" }), { assignee: "", state: "all" });
  assert.deepEqual(projectTaskFilter({ assignee: "me", taskState: "done" }), { assignee: "me", state: "done" });
});
