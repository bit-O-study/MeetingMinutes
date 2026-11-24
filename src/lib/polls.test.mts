import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildMonths, candidateDays, checkDeadlineChange, cleanName, isPollClosed, nameKey, pollInput,
  remainingLabel, seoulLocalToIso, tallyPoll, validName, voteInput,
} from "./polls";

const base = {
  title: "송년 스터디", foodType: "한식", restaurant: "", location: "합정", rangeStart: "2026-12-01", rangeEnd: "2026-12-31",
  excluded: ["2026-12-24"], respondBy: null,
};

test("투표 입력: 기간·제외일·후보일 규칙", () => {
  assert.ok(pollInput.safeParse(base).success);
  assert.equal(pollInput.safeParse({ ...base, rangeEnd: "2026-11-30" }).success, false, "끝이 시작보다 빠름");
  assert.equal(pollInput.safeParse({ ...base, rangeEnd: "2027-02-01" }).success, false, "60일 초과");
  assert.ok(pollInput.safeParse({ ...base, rangeEnd: "2027-01-29" }).success, "정확히 60일");
  assert.equal(pollInput.safeParse({ ...base, excluded: ["2027-01-01"] }).success, false, "범위 밖 제외일");
  assert.equal(pollInput.safeParse({ ...base, excluded: ["2026-12-24", "2026-12-24"] }).success, false, "중복 제외일");
  assert.equal(pollInput.safeParse({ ...base, rangeEnd: "2026-12-01", excluded: ["2026-12-01"] }).success, false, "후보일 0개");
  assert.equal(pollInput.safeParse({ ...base, title: "  " }).success, false);
  assert.equal(pollInput.safeParse({ ...base, foodType: "가".repeat(31) }).success, false, "음식 종류 30자 초과");
  assert.equal(pollInput.safeParse({ ...base, restaurant: "가".repeat(61) }).success, false, "식당 60자 초과");
  assert.equal(pollInput.safeParse({ ...base, location: "가".repeat(101) }).success, false, "위치 100자 초과");
  assert.ok(pollInput.safeParse({ ...base, foodType: "", restaurant: "", location: "" }).success, "모임 정보는 전부 비워도 된다");
  assert.equal(pollInput.safeParse({ ...base, rangeStart: "2026-02-30" }).success, false, "없는 날짜");
  assert.equal(pollInput.safeParse({ ...base, ownerId: "x" }).success, false, "모르는 키는 거부");
  assert.equal(pollInput.safeParse({ ...base, respondBy: "2026-11-30T18:00" }).success, false, "오프셋 없는 시각 거부");
  assert.ok(pollInput.safeParse({ ...base, respondBy: "2026-11-30T18:00:00+09:00" }).success);
});

test("서울 시각 문자열을 오프셋이 붙은 ISO 로 바꾼다", () => {
  assert.equal(seoulLocalToIso("2026-11-30T18:00"), "2026-11-30T18:00:00+09:00");
  assert.equal(seoulLocalToIso("2026-11-30T24:00"), null);
  assert.equal(seoulLocalToIso("2026-02-30T10:00"), null);
  assert.equal(seoulLocalToIso(""), null);
});

test("이름: 제어문자·공백 정리, 길이, 비교 키", () => {
  assert.equal(cleanName("  민수\u0000  \n 2 "), "민수 2");
  assert.equal(cleanName("a‮b"), "ab", "방향 제어 문자 제거");
  assert.equal(validName("   "), "이름이나 닉네임을 적어 주세요.");
  assert.equal(validName("가".repeat(21)) !== null, true);
  assert.equal(validName("가".repeat(20)), null);
  assert.equal(nameKey("Min Su"), nameKey(" minsu "), "공백·대소문자만 다른 이름은 같은 사람");
  assert.notEqual(nameKey("민수"), nameKey("민수2"));
});

test("투표 제출 입력: 모르는 키 거부, 불가일 상한", () => {
  const ok = { token: "abcdefgh12345678", name: "민수", days: ["2026-12-03"] };
  assert.ok(voteInput.safeParse(ok).success);
  assert.ok(voteInput.safeParse({ ...ok, days: [] }).success, "전부 가능도 제출");
  assert.equal(voteInput.safeParse({ ...ok, days: ["12/3"] }).success, false);
  assert.equal(voteInput.safeParse({ ...ok, pollId: "x" }).success, false);
  assert.equal(voteInput.safeParse({ ...ok, days: Array.from({ length: 61 }, () => "2026-12-03") }).success, false);
});

test("마감: 상태와 시각으로 계산한다", () => {
  const now = new Date("2026-11-24T05:00:00Z");
  const past = new Date("2026-11-24T04:00:00Z"), future = new Date("2026-11-30T09:00:00Z");
  assert.equal(isPollClosed({ status: "open", respondBy: null }, now), false);
  assert.equal(isPollClosed({ status: "open", respondBy: future }, now), false);
  assert.equal(isPollClosed({ status: "open", respondBy: past }, now), true, "시각이 지나면 status 가 open 이어도 닫힘");
  assert.equal(isPollClosed({ status: "open", respondBy: now }, now), true, "정각은 닫힘");
  assert.equal(isPollClosed({ status: "closed", respondBy: null }, now), true);
  assert.equal(isPollClosed({ status: "confirmed", respondBy: future }, now), true);
});

test("마감 변경 규칙: 과거 거절, 확정 거절, 닫힌 투표는 다시 열림, 해제 허용", () => {
  const now = new Date("2026-11-24T05:00:00Z");
  const future = new Date("2026-11-30T09:00:00Z");
  assert.deepEqual(checkDeadlineChange({ status: "open" }, future, now), { ok: true, status: "open" });
  assert.deepEqual(checkDeadlineChange({ status: "closed" }, future, now), { ok: true, status: "open" });
  assert.deepEqual(checkDeadlineChange({ status: "closed" }, null, now), { ok: true, status: "open" });
  assert.equal(checkDeadlineChange({ status: "open" }, new Date("2026-11-24T04:00:00Z"), now).ok, false);
  assert.equal(checkDeadlineChange({ status: "open" }, now, now).ok, false, "지금 정각도 과거로 본다");
  assert.equal(checkDeadlineChange({ status: "confirmed" }, future, now).ok, false);
  assert.equal(checkDeadlineChange({ status: "confirmed" }, null, now).ok, false);
});

test("남은 시간 표시", () => {
  const now = new Date("2026-11-24T05:00:00Z");
  assert.equal(remainingLabel(new Date("2026-11-30T09:00:00Z"), now), "6일 4시간 남음");
  assert.equal(remainingLabel(new Date("2026-11-24T07:30:00Z"), now), "2시간 30분 남음");
  assert.equal(remainingLabel(new Date("2026-11-24T05:00:20Z"), now), "1분 남음");
  assert.equal(remainingLabel(now, now), null);
});

test("집계: 가능 인원, 제외일과 겹친 불가 무시, 동률은 빠른 날", () => {
  const candidates = candidateDays("2026-12-01", "2026-12-05", ["2026-12-03"]);
  assert.deepEqual(candidates, ["2026-12-01", "2026-12-02", "2026-12-04", "2026-12-05"]);
  const t = tallyPoll(candidates, [
    { id: "a", unavailable: ["2026-12-01", "2026-12-03"] },
    { id: "b", unavailable: ["2026-12-01", "2026-12-02", "2026-12-02"] },
    { id: "c", unavailable: [] },
  ]);
  assert.equal(t.total, 3);
  assert.equal(t.available["2026-12-01"], 1);
  assert.equal(t.available["2026-12-02"], 2);
  assert.equal(t.available["2026-12-04"], 3);
  assert.equal("2026-12-03" in t.available, false, "제외일은 집계에 없다");
  assert.deepEqual(t.unavailableBy["2026-12-01"], ["a", "b"]);
  assert.deepEqual(t.ranked, ["2026-12-04", "2026-12-05", "2026-12-02", "2026-12-01"]);
  assert.equal(t.best, "2026-12-04");
});

test("집계: 응답이 없으면 추천이 없다", () => {
  assert.equal(tallyPoll(["2026-12-01"], []).best, null);
});

test("월 격자: 2026-12 는 화요일 시작, 여러 달에 걸친 기간", () => {
  const [dec] = buildMonths("2026-12-01", "2026-12-31");
  assert.equal(dec.label, "2026년 12월");
  assert.equal(dec.cells.length % 7, 0);
  assert.equal(dec.cells.findIndex((c) => c?.day === "2026-12-01"), 2);
  const months = buildMonths("2026-12-20", "2027-02-03");
  assert.deepEqual(months.map((m) => m.month), ["2026-12", "2027-01", "2027-02"]);
  const dec2 = months[0].cells.filter(Boolean);
  assert.equal(dec2.find((c) => c!.day === "2026-12-19")!.inRange, false);
  assert.equal(dec2.find((c) => c!.day === "2026-12-20")!.inRange, true);
  assert.equal(months[2].cells.find((c) => c?.day === "2027-02-04")!.inRange, false);
});
