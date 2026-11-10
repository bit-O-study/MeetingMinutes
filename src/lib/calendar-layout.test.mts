import { test } from "node:test";
import assert from "node:assert/strict";

import { addDays, daysInclusive, eachDay, isIsoDay, shortDay, startOfWeek, weekday } from "./calendar-dates";
import type { CalendarEntry } from "./calendar-entries";
import { dayDots, layoutWeek, monthWeeks } from "./calendar-layout";

function entry(id: string, start: string, end = start, over: Partial<CalendarEntry> = {}): CalendarEntry {
  return {
    id, kind: "task", layerId: "me", title: id, start, end, from: null, to: null, done: false, overdue: false,
    href: null, linkTitle: null, note: null, source: { type: "planner", id, version: 1 }, ...over,
  };
}

test("날짜 계산: 윤년, 월 경계, 양끝 포함 일수", () => {
  assert.equal(addDays("2028-02-28", 1), "2028-02-29");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(daysInclusive("2026-11-18", "2026-11-20"), 3);
  assert.equal(daysInclusive("2026-11-20", "2026-11-18"), 0);
  assert.deepEqual(eachDay("2026-11-29", "2026-12-01"), ["2026-11-29", "2026-11-30", "2026-12-01"]);
  assert.equal(isIsoDay("2026-02-29"), false);
  assert.equal(weekday("2026-11-01"), 0);
  assert.equal(startOfWeek("2026-11-12"), "2026-11-08");
  assert.equal(shortDay("2026-11-12"), "11/12(목)");
});

test("월 격자: 2026년 11월은 5주, 일요일에서 시작", () => {
  const weeks = monthWeeks("2026-11");
  assert.deepEqual(weeks, ["2026-11-01", "2026-11-08", "2026-11-15", "2026-11-22", "2026-11-29"]);
  assert.equal(monthWeeks("2026-08").length, 6); // 8월은 토요일에 시작해 6주
  assert.equal(monthWeeks("2026-02").length, 4); // 2월 1일이 일요일, 28일
});

test("기간 일정은 주마다 하나의 막대, 주를 넘으면 이어짐 표시", () => {
  const trip = entry("출장", "2026-11-12", "2026-11-17", { kind: "event" });
  const first = layoutWeek([trip], "2026-11-08", 3);
  assert.equal(first.segments.length, 1);
  assert.deepEqual([first.segments[0].col0, first.segments[0].col1], [4, 6]);
  assert.equal(first.segments[0].contLeft, false);
  assert.equal(first.segments[0].contRight, true);
  const second = layoutWeek([trip], "2026-11-15", 3);
  assert.deepEqual([second.segments[0].col0, second.segments[0].col1], [0, 2]);
  assert.equal(second.segments[0].contLeft, true);
  assert.equal(second.segments[0].contRight, false);
  assert.equal(layoutWeek([trip], "2026-11-22", 3).segments.length, 0);
});

test("한 줄에는 같은 칸을 두 항목이 차지하지 않는다", () => {
  const items = [
    entry("a", "2026-11-09", "2026-11-12"),
    entry("b", "2026-11-10"),
    entry("c", "2026-11-11"),
    entry("d", "2026-11-12", "2026-11-14"),
    entry("e", "2026-11-09"),
  ];
  const { segments } = layoutWeek(items, "2026-11-08", 10);
  for (let i = 0; i < segments.length; i += 1) {
    for (let j = i + 1; j < segments.length; j += 1) {
      const a = segments[i];
      const b = segments[j];
      const overlap = a.lane === b.lane && a.col0 <= b.col1 && b.col0 <= a.col1;
      assert.equal(overlap, false, `${a.entry.id} 와 ${b.entry.id} 가 같은 줄에서 겹친다`);
    }
  }
});

test("줄 수 한도를 넘으면 가려진 개수를 칸마다 센다", () => {
  const items = ["a", "b", "c", "d", "e"].map((id) => entry(id, "2026-11-10"));
  const layout = layoutWeek(items, "2026-11-08", 3);
  assert.equal(layout.segments.length, 3);
  assert.equal(layout.hidden[2], 2); // 화요일(10일)에서 2개가 가려진다
  assert.equal(layout.hidden.reduce((sum, n) => sum + n, 0), 2);
  const noLimit = layoutWeek(items, "2026-11-08", 8);
  assert.equal(noLimit.hidden.every((n) => n === 0), true);
});

test("기간이 긴 것이 위 줄, 같으면 종류 순(일정 → 모임 → 투표 → 할 일)", () => {
  const items = [
    entry("할일", "2026-11-10", "2026-11-10", { kind: "task" }),
    entry("모임", "2026-11-10", "2026-11-10", { kind: "meeting", from: "19:00" }),
    entry("기간", "2026-11-10", "2026-11-12", { kind: "event" }),
    entry("일정", "2026-11-10", "2026-11-10", { kind: "event", from: "09:00" }),
  ];
  const { segments } = layoutWeek(items, "2026-11-08", 8);
  const order = [...segments].sort((a, b) => a.lane - b.lane).map((s) => s.entry.id);
  assert.deepEqual(order, ["기간", "일정", "모임", "할일"]);
});

test("모바일 점: 최대 3개와 남은 개수", () => {
  const items = [1, 2, 3, 4, 5].map((n) => entry(`x${n}`, "2026-11-10"));
  const { dots, extra } = dayDots(items, "2026-11-10", 3);
  assert.equal(dots.length, 3);
  assert.equal(extra, 2);
  assert.equal(dayDots(items, "2026-11-11").dots.length, 0);
});

import { layoutDayBlocks } from "./calendar-layout";

test("시간표: 겹치는 일정은 나란히, 겹치지 않으면 한 열을 다 쓴다", () => {
  const at = (id: string, from: string, to: string) => entry(id, "2026-11-12", "2026-11-12", { kind: "event", from, to });
  const blocks = layoutDayBlocks([at("a", "10:00", "12:00"), at("b", "11:00", "13:00"), at("c", "11:30", "12:00"), at("d", "15:00", "16:00")]);
  const byId = Object.fromEntries(blocks.map((b) => [b.entry.id, b]));
  assert.equal(byId.d.cols, 1);
  assert.equal(byId.d.col, 0);
  assert.equal(byId.a.cols, 3); // a·b·c 가 한 묶음
  assert.equal(new Set([byId.a.col, byId.b.col, byId.c.col]).size, 3);
  // 같은 묶음 안에서 같은 열의 두 블록은 시간이 겹치지 않는다
  for (const x of blocks) for (const y of blocks) {
    if (x === y || x.col !== y.col) continue;
    assert.ok(x.endMin <= y.startMin || y.endMin <= x.startMin, `${x.entry.id}/${y.entry.id} 같은 열에서 겹침`);
  }
});

test("시간표: 짧은 일정은 최소 높이로 늘려 계산하고, 시각 없는 항목은 제외", () => {
  const short = entry("s", "2026-11-12", "2026-11-12", { kind: "event", from: "10:00", to: "10:10" });
  const blocks = layoutDayBlocks([short, entry("allday", "2026-11-12")]);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].endMin - blocks[0].startMin, 45);
  // 최소 높이 때문에 10:30 시작 일정과는 겹친다 → 나란히
  const next = entry("n", "2026-11-12", "2026-11-12", { kind: "event", from: "10:30", to: "11:30" });
  const two = layoutDayBlocks([short, next]);
  assert.equal(two[0].cols, 2);
});
