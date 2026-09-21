import assert from "node:assert/strict";
import { test } from "node:test";

import { sectionsFromDoc, summarizeChange } from "./revision-summary.js";

/** 스터디 템플릿을 흉내 낸 최소 문서 */
function doc(...nodes: unknown[]) {
  return { type: "doc", content: nodes };
}
const h = (text: string) => ({
  type: "heading",
  attrs: { level: 2 },
  content: [{ type: "text", text }],
});
const p = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
const check = (text: string, checked = false) => ({
  type: "taskList",
  content: [
    { type: "taskItem", attrs: { checked }, content: [p(text)] },
  ],
});

test("제목을 경계로 구획을 나눈다", () => {
  const s = sectionsFromDoc(doc(p("3회차 · 참석 김"), h("배운 것"), p("useEffect")));
  assert.deepEqual(
    s.map((x) => x.heading),
    ["머리말", "배운 것"],
  );
  assert.equal(s[1].text, "useEffect");
});

test("앞머리가 비어 있으면 구획으로 남기지 않는다", () => {
  const s = sectionsFromDoc(doc(h("배운 것"), p("내용")));
  assert.deepEqual(
    s.map((x) => x.heading),
    ["배운 것"],
  );
});

test("첫 작성은 노트 작성으로 요약한다", () => {
  const next = sectionsFromDoc(doc(h("배운 것"), p("내용")));
  assert.equal(summarizeChange([], next), "노트 작성");
});

test("바뀐 게 없으면 null — 리비전을 남기지 않는다", () => {
  // 커서만 움직여도 문서 업데이트가 오간다. 그때마다 이력이 쌓이면 못 읽는다.
  const d = doc(h("배운 것"), p("내용"));
  const a = sectionsFromDoc(d);
  const b = sectionsFromDoc(d);
  assert.equal(summarizeChange(a, b), null);
});

test("구획 내용을 고치면 수정으로 잡는다", () => {
  const before = sectionsFromDoc(doc(h("배운 것"), p("내용")));
  const after = sectionsFromDoc(doc(h("배운 것"), p("내용 더 붙임")));
  assert.equal(summarizeChange(before, after), "배운 것 수정");
});

test("새 구획이 생기면 추가로 잡는다", () => {
  const before = sectionsFromDoc(doc(h("배운 것"), p("내용")));
  const after = sectionsFromDoc(doc(h("배운 것"), p("내용"), h("다음 회차"), p("6장")));
  assert.equal(summarizeChange(before, after), "다음 회차 추가");
});

test("빈 구획이 생긴 것은 추가로 치지 않는다", () => {
  // 제목만 만들어 두고 아직 아무것도 안 적은 상태다.
  const before = sectionsFromDoc(doc(h("배운 것"), p("내용")));
  const after = sectionsFromDoc(doc(h("배운 것"), p("내용"), h("다음 회차")));
  assert.equal(summarizeChange(before, after), null);
});

test("구획이 사라지면 삭제로 잡는다", () => {
  const before = sectionsFromDoc(doc(h("배운 것"), p("내용"), h("막힌 것"), p("질문")));
  const after = sectionsFromDoc(doc(h("배운 것"), p("내용")));
  assert.equal(summarizeChange(before, after), "막힌 것 삭제");
});

test("체크만 눌러도 변경으로 잡는다", () => {
  // 글자가 그대로라 텍스트만 보면 놓친다.
  const before = sectionsFromDoc(doc(h("막힌 것"), check("cleanup 시점", false)));
  const after = sectionsFromDoc(doc(h("막힌 것"), check("cleanup 시점", true)));
  assert.equal(summarizeChange(before, after), "막힌 것 수정");
});

test("여러 구획이 바뀌면 한 줄로 줄인다", () => {
  const before = sectionsFromDoc(doc(h("A"), p("1"), h("B"), p("2"), h("C"), p("3")));
  const after = sectionsFromDoc(doc(h("A"), p("x"), h("B"), p("y"), h("C"), p("z")));
  assert.equal(summarizeChange(before, after), "A 외 2곳 수정");
});

test("추가와 수정이 함께 일어나면 둘 다 적는다", () => {
  const before = sectionsFromDoc(doc(h("배운 것"), p("내용")));
  const after = sectionsFromDoc(doc(h("배운 것"), p("고침"), h("다음 회차"), p("6장")));
  assert.equal(summarizeChange(before, after), "다음 회차 추가 · 배운 것 수정");
});
