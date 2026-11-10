import { test } from "node:test";
import assert from "node:assert/strict";

import { confirmedEnd, confirmInput, heatLevel, isPastDeadline, lastStartDay, meetingInput, rankWindows, responsesInput, tallyDay, windowStatus, type Votes } from "./meetings";

const SPACE = "11111111-1111-4111-8111-111111111111";
const base = { spaceId: SPACE, title: "송년회", location: "", memo: "", spanDays: 1, windowStart: "2026-11-21", windowEnd: "2026-11-29", respondBy: null };

test("모임 입력: 기간 역전, 두 달 초과, 구간보다 짧은 기간을 거부한다", () => {
  assert.ok(meetingInput.safeParse(base).success);
  assert.equal(meetingInput.safeParse({ ...base, windowEnd: "2026-11-20" }).success, false);
  assert.equal(meetingInput.safeParse({ ...base, windowEnd: "2027-02-01" }).success, false);
  assert.equal(meetingInput.safeParse({ ...base, windowStart: "2026-11-21", windowEnd: "2026-11-22", spanDays: 3 }).success, false);
  assert.ok(meetingInput.safeParse({ ...base, spanDays: 2 }).success);
  assert.equal(meetingInput.safeParse({ ...base, title: "  " }).success, false);
  assert.equal(meetingInput.safeParse({ ...base, windowStart: "2026-02-30" }).success, false);
  assert.equal(meetingInput.safeParse({ ...base, extra: 1 }).success, false);
});

test("응답·확정 입력 검증", () => {
  assert.ok(responsesInput.safeParse({ meetingId: SPACE, answers: [{ day: "2026-11-21", answer: "yes" }, { day: "2026-11-22", answer: null }] }).success);
  assert.equal(responsesInput.safeParse({ meetingId: SPACE, answers: [] }).success, false);
  assert.equal(responsesInput.safeParse({ meetingId: SPACE, answers: [{ day: "2026-11-21", answer: "maybe?" }] }).success, false);
  const confirm = { meetingId: SPACE, start: "2026-11-27", from: "18:00", to: "21:00", createNote: true };
  assert.ok(confirmInput.safeParse(confirm).success);
  assert.ok(confirmInput.safeParse({ ...confirm, from: null, to: null }).success);
  assert.equal(confirmInput.safeParse({ ...confirm, to: null }).success, false);
  assert.equal(confirmInput.safeParse({ ...confirm, from: "21:00", to: "18:00" }).success, false);
});

const members = ["a", "b", "c", "d"];
const votes: Votes = {
  "2026-11-26": { a: "yes", b: "yes", c: "no", d: "yes" },
  "2026-11-27": { a: "yes", b: "yes", c: "yes", d: "maybe" },
  "2026-11-28": { a: "yes", b: "maybe", c: "yes" },
};

test("한 날의 집계: 응답하지 않은 사람은 none", () => {
  assert.deepEqual(tallyDay(votes, "2026-11-28", members), { yes: 2, maybe: 1, no: 0, none: 1 });
  assert.deepEqual(tallyDay(votes, "2026-11-30", members), { yes: 0, maybe: 0, no: 0, none: 4 });
});

test("구간 응답: 하루라도 불가면 불가, 하루라도 비었으면 미응답, 조건부가 섞이면 조건부", () => {
  assert.equal(windowStatus(votes, "c", ["2026-11-26", "2026-11-27"]), "no");
  assert.equal(windowStatus(votes, "d", ["2026-11-27", "2026-11-28"]), "none");
  assert.equal(windowStatus(votes, "d", ["2026-11-26", "2026-11-27"]), "maybe");
  assert.equal(windowStatus(votes, "a", ["2026-11-26", "2026-11-27", "2026-11-28"]), "yes");
  assert.equal(windowStatus(votes, "b", ["2026-11-26", "2026-11-28"]), "maybe");
});

test("추천: 하루짜리는 가능 인원 순, 연속 2일은 두 날 모두 되는 사람만 센다", () => {
  const one = rankWindows({ windowStart: "2026-11-26", windowEnd: "2026-11-28", spanDays: 1, memberIds: members, votes });
  assert.equal(one[0].start, "2026-11-27"); // 가능 3 + 조건부 1 = 3.5
  assert.equal(one[0].score, 3.5);
  const two = rankWindows({ windowStart: "2026-11-26", windowEnd: "2026-11-28", spanDays: 2, memberIds: members, votes });
  assert.equal(two.length, 2);
  assert.equal(two[0].start, "2026-11-26"); // 26–27: a,b 가능 + d 조건부 = 2.5, c 불가
  assert.deepEqual(two[0].no, ["c"]);
  assert.equal(two[0].score, 2.5);
  assert.equal(two[1].start, "2026-11-27");
  assert.deepEqual(two[1].none, ["d"]); // d 는 28일에 답하지 않았다
});

test("필수 참석자가 불가인 구간은 점수가 높아도 맨 뒤", () => {
  const ranked = rankWindows({ windowStart: "2026-11-26", windowEnd: "2026-11-27", spanDays: 1, memberIds: members, votes, requiredIds: ["c"] });
  assert.equal(ranked[0].start, "2026-11-27");
  assert.equal(ranked[1].excluded, true);
});

test("점수가 같으면 미응답이 적은 쪽, 그래도 같으면 이른 날짜", () => {
  const tie: Votes = { "2026-12-01": { a: "yes" }, "2026-12-02": { a: "yes", b: "no" }, "2026-12-03": { a: "yes" } };
  const ranked = rankWindows({ windowStart: "2026-12-01", windowEnd: "2026-12-03", spanDays: 1, memberIds: ["a", "b"], votes: tie });
  assert.deepEqual(ranked.map((w) => w.start), ["2026-12-02", "2026-12-01", "2026-12-03"]);
});

test("구간 길이가 후보 기간보다 길면 후보가 없다", () => {
  assert.deepEqual(rankWindows({ windowStart: "2026-11-21", windowEnd: "2026-11-22", spanDays: 3, memberIds: members, votes }), []);
});

test("진하기·마감·시작 가능일", () => {
  assert.equal(heatLevel({ yes: 3, maybe: 2, no: 0, none: 1 }, 6), 4 / 6);
  assert.equal(heatLevel({ yes: 0, maybe: 0, no: 0, none: 0 }, 0), 0);
  assert.equal(isPastDeadline(null), false);
  assert.equal(isPastDeadline(new Date(1000), 2000), true);
  assert.equal(lastStartDay("2026-11-29", 3), "2026-11-27");
  assert.equal(confirmedEnd("2026-11-27", 2), "2026-11-28");
});
