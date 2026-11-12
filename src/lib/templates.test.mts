import assert from "node:assert/strict";
import { test } from "node:test";

import { TEMPLATES, buildTemplateDoc, docToPlainText, resolveNoteTitle } from "./templates.js";

const para = (...content: unknown[]) => ({ type: "paragraph", content });
const text = (value: string, bold = false) =>
  bold ? { type: "text", text: value, marks: [{ type: "bold" }] } : { type: "text", text: value };

test("서식 경계에서 단어를 쪼개지 않는다", () => {
  // 회귀: "회의**록**"이 "회의 록"으로 저장돼 "회의록" 검색에서 빠졌다.
  const doc = { type: "doc", content: [para(text("회의"), text("록", true), text("을 정리"))] };
  assert.equal(docToPlainText(doc), "회의록을 정리");
});

test("블록 사이와 줄바꿈은 공백 하나로 잇는다", () => {
  const doc = { type: "doc", content: [
    { type: "heading", attrs: { level: 2 }, content: [text("배운 것")] },
    para(text("첫 줄"), { type: "hardBreak" }, text("둘째 줄")),
    { type: "taskList", content: [{ type: "taskItem", attrs: { checked: false }, content: [para(text("4장 읽기"))] }] },
    para(),
  ] };
  assert.equal(docToPlainText(doc), "배운 것 첫 줄 둘째 줄 4장 읽기");
});

test("모양이 이상한 값에도 죽지 않는다", () => {
  assert.equal(docToPlainText(null), "");
  assert.equal(docToPlainText({ type: "doc", content: "x" }), "");
  assert.equal(docToPlainText({ type: "doc", content: [{ type: "text", text: 3 }] }), "");
});

test("템플릿 평문은 회차 번호를 담는다", () => {
  assert.match(docToPlainText(buildTemplateDoc("study", 7)), /^7회차 · 참석:/);
});

test("빈 노트 기본 제목은 서울 날짜를 쓴다", () => {
  // UTC 2026-10-22 16:30 = 서울 10-23 01:30. 서버 시간대(UTC)로 계산하면 10-22가 나왔다.
  const title = TEMPLATES.blank.defaultTitle({ sessionNo: 1, today: new Date("2026-10-22T16:30:00Z") });
  assert.equal(title, "2026-10-23 메모");
});

test("회차 경쟁: 제안 제목은 확정 번호로 다시 만든다", () => {
  // 회귀: 둘이 동시에 만들면 둘째 노트가 본문은 4회차, 제목은 "3회차"였다.
  const today = new Date("2026-10-23T03:00:00Z");
  assert.equal(resolveNoteTitle("study", "3회차", 4, today), "4회차");
  assert.equal(resolveNoteTitle("study", "  ", 4, today), "4회차");
  // 사람이 고친 제목은 그대로 둔다.
  assert.equal(resolveNoteTitle("study", "3회차 보충", 4, today), "3회차 보충");
  // 회차를 쓰지 않는 양식은 "N회차"도 사용자의 제목이다.
  assert.equal(resolveNoteTitle("blank", "3회차", 1, today), "3회차");
  assert.equal(resolveNoteTitle("handover", "", 1, today), "인수인계 메모");
  assert.equal(resolveNoteTitle("blank", "x".repeat(300), 1, today).length, 200);
});
