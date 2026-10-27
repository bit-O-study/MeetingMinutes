import { test } from "node:test";
import assert from "node:assert/strict";
import { plannerInput, plannerFields, occursOn, plannerOverdue, monthWindow, type PlannerInput } from "./planner";
const base: PlannerInput = { kind: "task", title: "계획", memo: "", mode: "range", startDate: null, endDate: "2026-10-26", date: null, from: null, to: null, allDay: false };
test("기간: 마감일만 지정, 역전과 실제 없는 날짜 거부", () => {
  assert.ok(plannerInput.safeParse(base).success);
  assert.equal(plannerInput.safeParse({ ...base, startDate: "2026-10-27" }).success, false);
  assert.equal(plannerInput.safeParse({ ...base, endDate: "2026-02-29" }).success, false);
  assert.ok(plannerInput.safeParse({ ...base, endDate: "2028-02-29" }).success);
  assert.equal(occursOn(base, "2026-10-25"), false);
  assert.equal(occursOn(base, "2026-10-26"), true);
  assert.ok(occursOn({ ...base, startDate: "2026-09-01" }, "2026-10-01"));
});
test("픽스: 시간 순서, 서울 자정 및 모드 변경 필드 정리", () => {
  const fixed: PlannerInput = { ...base, mode: "fixed", date: "2026-10-26", from: "00:00", to: "01:00" };
  assert.ok(plannerInput.safeParse(fixed).success);
  assert.equal(plannerFields(fixed).startsAt?.toISOString(), "2026-10-25T15:00:00.000Z");
  assert.equal(plannerFields(fixed).endDate, null);
  assert.equal(plannerInput.safeParse({ ...fixed, to: "00:00" }).success, false);
  assert.equal(plannerFields({ ...fixed, allDay: true }).startsAt, null);
  assert.equal(plannerFields({ ...fixed, mode: "none" }).scheduledDate, null);
  assert.equal(plannerInput.safeParse({ ...base, kind: "event" }).success, false);
});
test("마감·완료 여부와 월 경계", () => {
  const item = { ...base, id: "test", version: 1, done: false };
  assert.equal(plannerOverdue(item, "2026-10-26"), false);
  assert.equal(plannerOverdue(item, "2026-10-27"), true);
  assert.equal(plannerOverdue({ ...item, done: true }, "2026-10-27"), false);
  assert.deepEqual(monthWindow("2026-10"), { from: "2026-09-27", to: "2026-10-31" });
  assert.doesNotThrow(() => monthWindow("2100-12"));
  assert.throws(() => monthWindow("2026-13"));
});
