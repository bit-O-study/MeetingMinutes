/**
 * 모임 일정 정하기의 순수 로직. DB·React 와 무관해서 단위 테스트로 규칙을 고정한다.
 *
 * 후보는 시각이 아니라 날짜다. 후보 기간 안의 모든 날이 후보이고, spanDays 가 2 이상이면
 * 이어지는 날짜 구간(1박2일, 2박3일)을 찾는다.
 */
import { z } from "zod";

import { addDays, daysInclusive, eachDay, isIsoDay } from "./calendar-dates";

export type Answer = "yes" | "maybe" | "no";

const day = z.string().refine(isIsoDay, "날짜를 확인해 주세요.");
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "시각을 확인해 주세요.");

/** 후보 기간은 두 달을 넘기지 않는다. 그보다 길면 응답하기 전에 지친다. */
export const MAX_WINDOW_DAYS = 61;

export const meetingInput = z
  .object({
    spaceId: z.string().uuid(),
    title: z.string().trim().min(1, "모임 이름을 입력해 주세요.").max(120, "모임 이름은 120자까지예요."),
    location: z.string().trim().max(200, "장소는 200자까지예요."),
    memo: z.string().trim().max(4000),
    spanDays: z.number().int().min(1).max(7),
    windowStart: day,
    windowEnd: day,
    /** 응답 마감 시각(ISO). 없으면 마감 없음. */
    respondBy: z.string().datetime({ offset: true }).nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: "custom", message });
    if (value.windowEnd < value.windowStart) return issue("후보 기간의 끝이 시작보다 빠를 수 없어요.");
    const length = daysInclusive(value.windowStart, value.windowEnd);
    if (length > MAX_WINDOW_DAYS) issue("후보 기간은 두 달 이내로 정해 주세요.");
    if (length < value.spanDays) issue(`후보 기간이 ${value.spanDays}일보다 짧아요.`);
  });
export type MeetingInput = z.infer<typeof meetingInput>;

/** 한 번의 저장에 담는 응답. answer 가 null 이면 그 날의 응답을 지운다. */
export const responsesInput = z
  .object({
    meetingId: z.string().uuid(),
    answers: z.array(z.object({ day, answer: z.enum(["yes", "maybe", "no"]).nullable() }).strict()).min(1).max(MAX_WINDOW_DAYS),
  })
  .strict();

export const confirmInput = z
  .object({
    meetingId: z.string().uuid(),
    start: day,
    from: time.nullable(),
    to: time.nullable(),
    createNote: z.boolean(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if ((value.from === null) !== (value.to === null)) ctx.addIssue({ code: "custom", message: "시작과 종료 시각을 함께 정해 주세요." });
    if (value.from && value.to && value.from >= value.to) ctx.addIssue({ code: "custom", message: "종료 시각을 시작 이후로 정해 주세요." });
  });

/** day → (userId → 응답). 응답하지 않은 칸은 키가 없다. */
export type Votes = Record<string, Record<string, Answer>>;

export type DayTally = { yes: number; maybe: number; no: number; none: number };

export function tallyDay(votes: Votes, dayKey: string, memberIds: readonly string[]): DayTally {
  const row = votes[dayKey] ?? {};
  const tally: DayTally = { yes: 0, maybe: 0, no: 0, none: 0 };
  for (const id of memberIds) {
    const answer = row[id];
    if (answer === "yes") tally.yes += 1;
    else if (answer === "maybe") tally.maybe += 1;
    else if (answer === "no") tally.no += 1;
    else tally.none += 1;
  }
  return tally;
}

/** 한 사람이 구간 전체에 대해 낸 답. 하루라도 '불가'면 불가, 하루라도 비었으면 미응답. */
export type WindowStatus = "yes" | "maybe" | "no" | "none";

export function windowStatus(votes: Votes, userId: string, days: readonly string[]): WindowStatus {
  let maybe = false;
  let none = false;
  for (const dayKey of days) {
    const answer = votes[dayKey]?.[userId];
    if (answer === "no") return "no";
    if (answer === undefined) none = true;
    else if (answer === "maybe") maybe = true;
  }
  if (none) return "none";
  return maybe ? "maybe" : "yes";
}

export type RankedWindow = {
  start: string;
  end: string;
  days: string[];
  /** 구간 내내 가능한 사람 / 조건부가 섞인 사람 / 하루라도 불가 / 아직 다 답하지 않은 사람 */
  yes: string[];
  maybe: string[];
  no: string[];
  none: string[];
  /** 가능 1점, 조건부 0.5점 */
  score: number;
  /** 필수 참석자가 불가인 구간 — 추천에서 뺀다 */
  excluded: boolean;
};

/**
 * 후보 구간을 점수순으로 나열한다.
 * 정렬: 점수 내림차순 → 미응답이 적은 순 → 이른 날짜. 필수 참석자가 불가인 구간은 맨 뒤.
 */
export function rankWindows(options: {
  windowStart: string;
  windowEnd: string;
  spanDays: number;
  memberIds: readonly string[];
  votes: Votes;
  requiredIds?: readonly string[];
}): RankedWindow[] {
  const { windowStart, windowEnd, spanDays, memberIds, votes, requiredIds = [] } = options;
  const allDays = eachDay(windowStart, windowEnd);
  const ranked: RankedWindow[] = [];
  for (let index = 0; index + spanDays <= allDays.length; index += 1) {
    const days = allDays.slice(index, index + spanDays);
    const result: RankedWindow = { start: days[0], end: days[days.length - 1], days, yes: [], maybe: [], no: [], none: [], score: 0, excluded: false };
    for (const id of memberIds) result[windowStatus(votes, id, days)].push(id);
    result.score = result.yes.length + result.maybe.length * 0.5;
    result.excluded = requiredIds.some((id) => result.no.includes(id));
    ranked.push(result);
  }
  return ranked.sort(
    (a, b) =>
      Number(a.excluded) - Number(b.excluded) ||
      b.score - a.score ||
      a.none.length - b.none.length ||
      (a.start < b.start ? -1 : a.start > b.start ? 1 : 0),
  );
}

/** 칸 색의 진하기(0~1). 가능한 사람 비율을 기준으로 하고 조건부는 절반으로 센다. */
export function heatLevel(tally: DayTally, total: number): number {
  if (total <= 0) return 0;
  return Math.min(1, (tally.yes + tally.maybe * 0.5) / total);
}

/** 응답 마감이 지났는지. 지나도 확정 전에는 응답할 수 있다(소프트 마감). */
export function isPastDeadline(respondBy: Date | null, now = Date.now()): boolean {
  return respondBy !== null && respondBy.getTime() < now;
}

/** 후보 기간 안에서 spanDays 구간을 이루는 마지막 시작일. 이 뒤의 날짜는 시작 후보가 아니다. */
export function lastStartDay(windowEnd: string, spanDays: number): string {
  return addDays(windowEnd, -(spanDays - 1));
}

export function confirmedEnd(start: string, spanDays: number): string {
  return addDays(start, spanDays - 1);
}
