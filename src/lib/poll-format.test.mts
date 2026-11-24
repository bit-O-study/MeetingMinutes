import { test } from "node:test";
import assert from "node:assert/strict";

import { dayLabel, deadlineLabel, seoulEvening, toSeoulLocal } from "./poll-format";

test("날짜 표기: 요일을 붙인다", () => {
  assert.equal(dayLabel("2026-12-11"), "12월 11일 (금)");
  assert.equal(dayLabel("2026-12-01"), "12월 1일 (화)");
});

test("마감 표기는 서울 시간이다(UTC 로 들어와도)", () => {
  assert.equal(deadlineLabel("2026-11-30T09:00:00Z"), "11월 30일 (월) 18:00");
  assert.equal(deadlineLabel("2026-11-30T18:00:00+09:00"), "11월 30일 (월) 18:00");
  assert.equal(toSeoulLocal("2026-11-30T15:30:00Z"), "2026-12-01T00:30", "UTC 15:30 은 서울에서 다음날 00:30");
});

test("n일 뒤 저녁 18:00", () => {
  assert.equal(seoulEvening("2026-11-24", 3), "2026-11-27T18:00");
  assert.equal(seoulEvening("2026-12-30", 3), "2027-01-02T18:00");
});
