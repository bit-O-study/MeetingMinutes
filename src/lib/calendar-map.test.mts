import { test } from "node:test";
import assert from "node:assert/strict";

import { meetingToEntry, plannerToEntry, spaceTaskToEntry } from "./calendar-map";
import { plannerInput, type PlannerItem } from "./planner";

const base: PlannerItem = {
  id: "i1", version: 1, done: false, kind: "task", title: "할 일", memo: "", mode: "range",
  startDate: null, endDate: "2026-11-12", date: null, from: null, to: null, allDay: false,
};
const none = new Map<string, string>();

test("개인 항목: 미정은 캘린더에 올리지 않고, 시작일 없는 기간은 마감일 하루", () => {
  assert.equal(plannerToEntry({ ...base, mode: "none", endDate: null }, "2026-11-10", none), null);
  const deadline = plannerToEntry(base, "2026-11-10", none)!;
  assert.deepEqual([deadline.start, deadline.end], ["2026-11-12", "2026-11-12"]);
  const range = plannerToEntry({ ...base, startDate: "2026-11-09" }, "2026-11-10", none)!;
  assert.deepEqual([range.start, range.end], ["2026-11-09", "2026-11-12"]);
});

test("개인 일정: 하루(시각/종일)와 여러 날", () => {
  const timed = plannerToEntry({ ...base, kind: "event", mode: "fixed", date: "2026-11-11", from: "15:00", to: "16:00", endDate: null }, "2026-11-10", none)!;
  assert.equal(timed.kind, "event");
  assert.deepEqual([timed.from, timed.to], ["15:00", "16:00"]);
  const allDay = plannerToEntry({ ...base, kind: "event", mode: "fixed", date: "2026-11-11", allDay: true, from: "09:00", to: "10:00", endDate: null }, "2026-11-10", none)!;
  assert.equal(allDay.from, null);
  const trip = plannerToEntry({ ...base, kind: "event", mode: "range", startDate: "2026-11-18", endDate: "2026-11-20" }, "2026-11-10", none)!;
  assert.deepEqual([trip.start, trip.end, trip.kind], ["2026-11-18", "2026-11-20", "event"]);
});

test("일정에 기간을 허용한다: 시작일 필수, 연결은 할 일에만", () => {
  const event = { kind: "event", title: "출장", memo: "", mode: "range", startDate: "2026-11-18", endDate: "2026-11-20", date: null, from: null, to: null, allDay: false };
  assert.ok(plannerInput.safeParse(event).success);
  assert.equal(plannerInput.safeParse({ ...event, startDate: null }).success, false);
  assert.equal(plannerInput.safeParse({ ...event, mode: "none", startDate: null, endDate: null }).success, false);
  const L = "11111111-1111-4111-8111-111111111111";
  assert.equal(plannerInput.safeParse({ ...event, linkedItemId: L }).success, false);
  const task = { ...event, kind: "task" };
  assert.ok(plannerInput.safeParse({ ...task, linkedItemId: L }).success);
  assert.equal(plannerInput.safeParse({ ...task, linkedItemId: L, linkedMeetingId: L }).success, false);
});

test("연결된 일정·모임 제목이 칩으로 붙는다", () => {
  const titles = new Map([["L1", "7회차 스터디"]]);
  assert.equal(plannerToEntry({ ...base, linkedMeetingId: "L1" }, "2026-11-10", titles)!.linkTitle, "7회차 스터디");
  assert.equal(plannerToEntry({ ...base, linkedMeetingId: "L9" }, "2026-11-10", titles)!.linkTitle, null);
});

test("지연: 마감이 지났고 끝내지 않은 것만", () => {
  assert.equal(plannerToEntry(base, "2026-11-13", none)!.overdue, true);
  assert.equal(plannerToEntry({ ...base, done: true }, "2026-11-13", none)!.overdue, false);
  assert.equal(plannerToEntry(base, "2026-11-12", none)!.overdue, false);
});

test("스페이스 할 일: 노트로 이동, 지연 계산, 레이어는 스페이스", () => {
  const row = { id: "t1", body: "4장 읽기", dueDate: "2026-11-12", doneAt: null, spaceId: "S1", noteId: "N1", noteTitle: "6회차" };
  const entry = spaceTaskToEntry(row, "2026-11-13");
  assert.equal(entry.layerId, "S1");
  assert.equal(entry.href, "/s/S1/n/N1");
  assert.equal(entry.overdue, true);
  assert.equal(spaceTaskToEntry({ ...row, doneAt: new Date() }, "2026-11-13").overdue, false);
});

test("모임: 확정은 확정 날짜·시각, 투표 중은 후보 기간과 응답 현황, 취소는 없음", () => {
  const meeting = { id: "m1", spaceId: "S1", title: "송년회", status: "polling" as const, windowStart: "2026-11-21", windowEnd: "2026-11-29", confirmedStart: null, confirmedEnd: null, confirmedFrom: null, confirmedTo: null, responded: 5, members: 6 };
  const poll = meetingToEntry(meeting)!;
  assert.deepEqual([poll.kind, poll.start, poll.end], ["poll", "2026-11-21", "2026-11-29"]);
  assert.equal(poll.note, "투표 중 · 응답 5/6명");
  const confirmed = meetingToEntry({ ...meeting, status: "confirmed", confirmedStart: "2026-11-27", confirmedEnd: "2026-11-28", confirmedFrom: "18:00", confirmedTo: "21:00" })!;
  assert.deepEqual([confirmed.kind, confirmed.start, confirmed.end, confirmed.from], ["meeting", "2026-11-27", "2026-11-28", "18:00"]);
  assert.equal(meetingToEntry({ ...meeting, status: "cancelled" }), null);
});
