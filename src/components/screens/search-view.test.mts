import { test } from "node:test";
import assert from "node:assert/strict";
import { searchHref, searchLimit, searchParts } from "./search-view";

test("검색어의 특수문자와 반복 일치를 원문 그대로 강조한다", () => {
  const text = "C++ [검토] c++ <script>";
  const parts = searchParts(text, "c++");
  assert.equal(parts.map(part => part.text).join(""), text);
  assert.deepEqual(parts.filter(part => part.match).map(part => part.text), ["C++", "c++"]);
  for (const query of ["[검토]", "<script>", ".*", "\\", "(", "$", "?"]) {
    assert.deepEqual(searchParts(query, query), [{ text: query, match: true }]);
  }
});

test("빈 검색어와 일치하지 않는 한글은 원문을 보존한다", () => {
  assert.deepEqual(searchParts("회의록", ""), [{ text: "회의록", match: false }]);
  assert.deepEqual(searchParts("회의록", "다음"), [{ text: "회의록", match: false }]);
  assert.deepEqual(searchParts("회의 회의", "회의").filter(part => part.match).map(part => part.text), ["회의", "회의"]);
});

test("더 보기 링크는 검색 조건과 특수문자를 보존한다", () => {
  const filters = { q: "회의 & C++ #질문", space: "space-id", status: "draft", from: "2026-11-01", to: "2026-11-25" };
  const url = new URL(searchHref(filters, {}, 60), "https://example.test");
  for (const [key, value] of Object.entries(filters)) assert.equal(url.searchParams.get(key), value);
  assert.equal(url.searchParams.get("limit"), "60");
  const cleared = new URL(searchHref(filters, { space: "" }), url);
  assert.equal(cleared.searchParams.has("space"), false);
  assert.equal(cleared.searchParams.has("limit"), false);
  assert.equal(cleared.searchParams.get("q"), filters.q);
  assert.equal(cleared.searchParams.get("status"), "draft");
});

test("조회 건수는 잘못된 URL에서도 액션의 허용 범위를 벗어나지 않는다", () => {
  for (const value of ["", "-1", "NaN", "Infinity", "0", "60.5", "abc"]) assert.equal(searchLimit(value), 30);
  assert.equal(searchLimit("60"), 60);
  assert.equal(searchLimit("9999"), 100);
});
