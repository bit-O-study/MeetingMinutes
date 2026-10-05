import assert from "node:assert/strict";
import { test } from "node:test";
import { issueInput } from "./issue-input";

const base = { spaceId: "00000000-0000-4000-8000-000000000001", title: " 로그인 오류 ", body: "재현 경로", status: "open", priority: "high", assigneeId: null };
test("이슈는 제목을 정리하고 임의 권한 필드를 버린다", () => {
  const result = issueInput.parse({ ...base, createdBy: "other", owner: true });
  assert.equal(result.title, "로그인 오류");
  assert.equal("createdBy" in result, false);
});
test("빈 제목·과도한 내용·알 수 없는 상태·담당자를 거부한다", () => {
  for (const patch of [{ title: " " }, { body: "x".repeat(10001) }, { status: "approved" }, { assigneeId: "someone" }]) {
    assert.equal(issueInput.safeParse({ ...base, ...patch }).success, false);
  }
});
test("수정에는 버전이 필요하며 잘못된 버전을 거부한다", () => {
  const existing = { ...base, id: base.spaceId };
  assert.equal(issueInput.safeParse(existing).success, false);
  assert.equal(issueInput.safeParse({ ...existing, version: 0 }).success, false);
  assert.equal(issueInput.safeParse({ ...existing, version: 2 }).success, true);
});
