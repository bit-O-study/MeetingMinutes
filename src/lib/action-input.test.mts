import assert from "node:assert/strict";
import { test } from "node:test";

import {
  InvalidDocError,
  assertNoteDoc,
  createTaskInput,
  searchOptionsInput,
  taskPatchInput,
} from "./action-input.js";

const UUID = "11111111-2222-4333-8444-555555555555";
const OTHER = "99999999-8888-4777-8666-555555555555";

test("할 일 수정은 허용한 필드만 남긴다", () => {
  // 실제 컬럼명이라 그대로 넘기면 set()을 통과한다. 여기서 떨어져야 한다.
  const parsed = taskPatchInput.parse({
    body: "  정리하기  ",
    noteId: OTHER,
    spaceId: OTHER,
    doneAt: new Date(),
    sortOrder: 99,
  });

  assert.deepEqual(parsed, { body: "정리하기" });
});

test("할 일 수정은 비우기를 허용하고 빈 변경은 거절한다", () => {
  assert.deepEqual(taskPatchInput.parse({ assigneeId: null, dueDate: null }), {
    assigneeId: null,
    dueDate: null,
  });
  assert.equal(taskPatchInput.safeParse({}).success, false);
  assert.equal(taskPatchInput.safeParse({ noteId: OTHER }).success, false);
});

test("기한은 형식과 실재하는 날짜를 함께 본다", () => {
  assert.equal(taskPatchInput.safeParse({ dueDate: "2026-09-29" }).success, true);
  for (const bad of ["2026-13-01", "2026-02-31", "26-09-29", "2026-09-29T00:00:00Z", "오늘"]) {
    assert.equal(taskPatchInput.safeParse({ dueDate: bad }).success, false, bad);
  }
});

test("할 일 생성은 노트·담당자 id 형식과 문구 길이를 확인한다", () => {
  const ok = createTaskInput.parse({ noteId: UUID, body: "읽어 오기", assigneeId: UUID });
  assert.equal(ok.noteId, UUID);

  assert.equal(createTaskInput.safeParse({ noteId: "not-a-uuid", body: "x" }).success, false);
  assert.equal(createTaskInput.safeParse({ noteId: UUID, body: "   " }).success, false);
  assert.equal(
    createTaskInput.safeParse({ noteId: UUID, body: "x".repeat(2001) }).success,
    false,
  );
});

test("검색은 빈 칸을 값 없음으로 받고 건수 상한을 건다", () => {
  // 폼이 고르지 않은 칸을 빈 문자열로 보낸다. 이게 오류가 되면 평범한 검색이 죽는다.
  const parsed = searchOptionsInput.parse({ from: "", to: "", status: "", spaceIds: [UUID] });
  assert.equal(parsed.from, undefined);
  assert.equal(parsed.to, undefined);
  assert.equal(parsed.status, undefined);
  assert.equal(parsed.limit, 30);

  assert.equal(searchOptionsInput.safeParse({ limit: 100000 }).success, false);
  assert.equal(searchOptionsInput.safeParse({ limit: 0 }).success, false);
  assert.equal(searchOptionsInput.safeParse({ from: "2026-02-31" }).success, false);
});

test("본문은 모양만 보고 통과시킨다", () => {
  const doc = {
    type: "doc",
    content: [
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "합의" }] },
      { type: "taskList", content: [{ type: "taskItem", attrs: { blockId: "abc" } }] },
    ],
  };
  assert.equal(assertNoteDoc(doc), doc);
  assert.equal(assertNoteDoc(null), null);
});

test("본문이 문서 모양이 아니면 거절한다", () => {
  for (const bad of ["문자열", 42, [], { content: [] }, { type: "" }]) {
    assert.throws(() => assertNoteDoc(bad), InvalidDocError, JSON.stringify(bad));
  }
  assert.throws(() => assertNoteDoc({ type: "doc", content: "글" }), InvalidDocError);
  assert.throws(
    () => assertNoteDoc({ type: "doc", content: [{ type: "text", text: 1 }] }),
    InvalidDocError,
  );
});

test("본문의 깊이와 노드 수에 상한이 있다", () => {
  // docToPlainText가 재귀로 순회하므로, 깊이를 막지 않으면 스택을 넘긴다.
  let deep: unknown = { type: "text", text: "바닥" };
  for (let i = 0; i < 200; i += 1) deep = { type: "blockquote", content: [deep] };
  assert.throws(() => assertNoteDoc(deep), InvalidDocError);

  const wide = {
    type: "doc",
    content: Array.from({ length: 20_001 }, () => ({ type: "paragraph" })),
  };
  assert.throws(() => assertNoteDoc(wide), InvalidDocError);
});

test("링크 만료는 1~365일 정수 또는 만료 없음만 받는다", async () => {
  const { linkExpiryInput } = await import("./action-input.js");
  for (const ok of [{}, { expiresInDays: null }, { expiresInDays: 1 }, { expiresInDays: 30 }, { expiresInDays: 365 }]) {
    assert.ok(linkExpiryInput.safeParse(ok).success, JSON.stringify(ok));
  }
  for (const bad of [{ expiresInDays: 0 }, { expiresInDays: -1 }, { expiresInDays: 366 }, { expiresInDays: 1e9 }, { expiresInDays: 1.5 }, { expiresInDays: "7" }]) {
    assert.ok(!linkExpiryInput.safeParse(bad).success, JSON.stringify(bad));
  }
});

test("스페이스 생성 입력은 이름 길이와 용도를 확인한다", async () => {
  const { createSpaceInput } = await import("./action-input.js");
  assert.deepEqual(createSpaceInput.parse({ name: "  스터디  ", kind: "study", ownerId: OTHER }), { name: "스터디", kind: "study" });
  assert.ok(!createSpaceInput.safeParse({ name: "   ", kind: "study" }).success);
  assert.ok(!createSpaceInput.safeParse({ name: "x".repeat(81), kind: "study" }).success);
  assert.ok(!createSpaceInput.safeParse({ name: "a", kind: "admin" }).success);
});

test("본문 체크박스 목록은 모양과 개수를 확인한다", async () => {
  const { docTaskItemsInput, createNoteInput, noteStatusInput } = await import("./action-input.js");
  assert.deepEqual(docTaskItemsInput.parse([{ blockId: "b1", body: " 읽기 ", checked: false, extra: 1 }]), [{ blockId: "b1", body: " 읽기 ", checked: false }]);
  assert.ok(!docTaskItemsInput.safeParse("not-array").success);
  assert.ok(!docTaskItemsInput.safeParse([{ blockId: "", body: "x", checked: false }]).success);
  assert.ok(!docTaskItemsInput.safeParse([{ blockId: "b", body: "x", checked: "yes" }]).success);
  assert.ok(!docTaskItemsInput.safeParse(Array.from({ length: 501 }, (_, i) => ({ blockId: `b${i}`, body: "", checked: false }))).success);
  assert.ok(createNoteInput.safeParse({ spaceId: UUID, template: "study" }).success);
  assert.ok(!createNoteInput.safeParse({ spaceId: "x", template: "study" }).success);
  assert.ok(!noteStatusInput.safeParse("approved").success);
});
