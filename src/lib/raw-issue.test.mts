import assert from "node:assert/strict";
import { test } from "node:test";
import { chatMessageInput, rawIssueTitle, issueInput } from "./issue-input.js";
const ids = { spaceId: "cd62250e-4b9d-4d33-8b97-2961b6a57a87", id: "5af2c64c-0a23-4ac8-a922-c363ac8182d2" };
test("미가공 메시지는 공백과 줄바꿈을 포함한 원문을 보존한다", () => {
  const body = "  w3 프로젝트 메모\n\n한글 입력 확인  ";
  assert.equal(chatMessageInput.parse({ ...ids, body }).body, body);
  assert.equal(rawIssueTitle(body), "w3 프로젝트 메모");
});
test("빈 메시지와 과도한 길이는 거절한다", () => {
  for (const body of [" \n ", "x".repeat(10001)]) assert.equal(chatMessageInput.safeParse({ ...ids, body }).success, false);
  assert.equal(chatMessageInput.safeParse({ ...ids, body: "x".repeat(10000) }).success, true);
});
test("미가공 이슈를 일반 이슈로 정리할 수 있다", () => {
  for (const status of ["open", "in_progress", "closed"]) assert.equal(issueInput.safeParse({ ...ids, version: 1, title: "메모", body: "내용", status, priority: "normal", assigneeId: null }).success, true);
});

test("이슈 가공은 실제 상태만 허용하고 원문 변경 요청을 무시한다", () => {
  const input = { ...ids, version: 1, title: "정리한 제목", body: "정리한 내용", status: "open", priority: "high", assigneeId: null, originalBody: "조작한 원문" };
  const parsed = issueInput.parse(input);
  assert.equal("originalBody" in parsed, false);
  assert.equal(issueInput.safeParse({ ...input, status: "raw" }).success, false);
});
