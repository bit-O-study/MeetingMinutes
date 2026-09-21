import assert from "node:assert/strict";
import { test } from "node:test";

import { countOpenQuestions } from "./questions.js";

const doc = (...nodes: unknown[]) => ({ type: "doc", content: nodes });
const h = (text: string) => ({
  type: "heading",
  attrs: { level: 2 },
  content: [{ type: "text", text }],
});
const p = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
const tasks = (...items: [string, boolean][]) => ({
  type: "taskList",
  content: items.map(([text, checked]) => ({
    type: "taskItem",
    attrs: { checked },
    content: [text ? p(text) : { type: "paragraph" }],
  })),
});

test("질문 구획의 미해결 항목만 센다", () => {
  const d = doc(
    h("배운 것"),
    p("useEffect"),
    h("막힌 것 · 질문"),
    tasks(["cleanup 시점", false], ["StrictMode 이중 호출", true], ["의존성 배열", false]),
  );
  assert.equal(countOpenQuestions(d), 2);
});

test("다른 구획의 할 일은 섞이지 않는다", () => {
  // 다음 회차도 체크박스지만 질문이 아니다.
  const d = doc(
    h("막힌 것 · 질문"),
    tasks(["cleanup 시점", false]),
    h("다음 회차"),
    tasks(["6장 읽기", false], ["발표 준비", false]),
  );
  assert.equal(countOpenQuestions(d), 1);
});

test("인수인계의 인수자 질문도 센다", () => {
  const d = doc(
    h("주의사항 · 함정"),
    p("배치 재실행 주의"),
    h("인수자 질문"),
    tasks(["재실행 절차", false]),
  );
  assert.equal(countOpenQuestions(d), 1);
});

test("빈 항목은 세지 않는다", () => {
  // 템플릿이 빈 체크박스를 달고 온다. 그냥 세면 새 노트가 전부 "질문 1"이 된다.
  const d = doc(h("막힌 것 · 질문"), tasks(["", false]));
  assert.equal(countOpenQuestions(d), 0);
});

test("전부 해결하면 0", () => {
  const d = doc(h("막힌 것 · 질문"), tasks(["a", true], ["b", true]));
  assert.equal(countOpenQuestions(d), 0);
});

test("질문 구획이 없으면 0", () => {
  const d = doc(h("배운 것"), tasks(["a", false]));
  assert.equal(countOpenQuestions(d), 0);
});

test("내용이 없으면 0", () => {
  assert.equal(countOpenQuestions(null), 0);
  assert.equal(countOpenQuestions({ type: "doc" }), 0);
});
