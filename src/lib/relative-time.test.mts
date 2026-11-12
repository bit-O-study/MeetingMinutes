import assert from "node:assert/strict";
import { test } from "node:test";

import { relativeTime, shortDate } from "./utils.js";

const NOW = new Date("2026-10-23T03:00:00Z"); // 서울 2026-10-23 12:00

test("가까운 시각은 상대 표기", () => {
  assert.equal(relativeTime(new Date("2026-10-23T02:59:40Z"), NOW), "방금");
  assert.equal(relativeTime(new Date("2026-10-23T02:15:00Z"), NOW), "45분 전");
  assert.equal(relativeTime(new Date("2026-10-22T22:00:00Z"), NOW), "5시간 전");
  assert.equal(relativeTime(new Date("2026-10-22T01:00:00Z"), NOW), "어제");
  assert.equal(relativeTime("2026-10-19T03:00:00Z", NOW), "4일 전");
});

test("올해 날짜는 월·일만", () => {
  assert.equal(relativeTime(new Date("2026-09-01T03:00:00Z"), NOW), "09. 01.");
});

test("해가 다르면 연도를 붙인다", () => {
  // 회귀: 1년 넘은 노트도 "10. 01."로만 보여 올해 것처럼 보였다.
  assert.equal(relativeTime(new Date("2025-10-01T03:00:00Z"), NOW), "2025. 10. 01.");
});

test("연도 판단도 서울 기준이다", () => {
  // UTC로는 2025-12-31 16:00이지만 서울은 2026-01-01 01:00 — 올해다.
  const jan1 = new Date("2025-12-31T16:00:00Z");
  assert.equal(shortDate(jan1, NOW), "01. 01.");
});
