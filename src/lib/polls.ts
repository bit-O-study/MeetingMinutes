/**
 * 일정 투표(링크 참여형)의 순수 로직. DB·React 와 무관해서 단위 테스트로 규칙을 고정한다.
 * 설계: docs/GUEST-SCHEDULE-POLL.md
 *
 * 투표는 "안 되는 날"만 저장한다. 가능한 사람 수는 전체 응답 - 그날 불가한 사람 수다.
 * 시각은 전부 서울 기준이고, 날짜는 YYYY-MM-DD 문자열로만 다룬다(Date 변환이 날짜를 밀지 않게).
 */
import { z } from "zod";

import { addDays, daysInclusive, eachDay, isIsoDay, weekday } from "./calendar-dates";

/** 후보 기간 상한. DB 체크 제약(끝 - 시작 <= 59)과 같다. */
export const MAX_POLL_DAYS = 60;
export const MAX_NAME_LENGTH = 20;

const day = z.string().refine(isIsoDay, "날짜를 확인해 주세요.");

/** 서울 시각 문자열("2026-11-30T18:00") → 오프셋이 붙은 ISO. 서버는 항상 이 형식만 받는다. */
export function seoulLocalToIso(local: string): string | null {
  const match = local.match(/^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match || !isIsoDay(match[1])) return null;
  return `${match[1]}T${match[2]}:${match[3]}:00+09:00`;
}

const deadline = z.string().datetime({ offset: true }).nullable();

/** 음식 종류·식당·위치. 전부 선택이고 짧게만 받는다. */
const placeFields = {
  foodType: z.string().trim().max(30, "음식 종류는 30자까지예요."),
  restaurant: z.string().trim().max(60, "식당은 60자까지예요."),
  location: z.string().trim().max(100, "위치는 100자까지예요."),
};

export const pollInput = z
  .object({
    title: z.string().trim().min(1, "제목을 입력해 주세요.").max(80, "제목은 80자까지예요."),
    ...placeFields,
    rangeStart: day,
    rangeEnd: day,
    excluded: z.array(day).max(MAX_POLL_DAYS),
    respondBy: deadline,
  })
  .strict()
  .superRefine((value, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: "custom", message });
    if (value.rangeEnd < value.rangeStart) return issue("기간의 끝이 시작보다 빠를 수 없어요.");
    const length = daysInclusive(value.rangeStart, value.rangeEnd);
    if (length > MAX_POLL_DAYS) return issue("후보 기간은 60일 이내로 정해 주세요.");
    const outside = value.excluded.find((d) => d < value.rangeStart || d > value.rangeEnd);
    if (outside) return issue("후보 기간 밖의 제외일이 있어요.");
    const unique = new Set(value.excluded);
    if (unique.size !== value.excluded.length) return issue("같은 날이 제외일에 두 번 들어 있어요.");
    if (length - unique.size < 1) issue("후보일이 하나도 없어요. 제외일을 줄여 주세요.");
  });
export type PollInput = z.infer<typeof pollInput>;

/** 제목과 모임 정보만 고칠 수 있다. 기간·제외일을 바꾸면 이미 낸 응답이 어긋난다. */
export const pollPatchInput = z
  .object({
    title: z.string().trim().min(1, "제목을 입력해 주세요.").max(80).optional(),
    foodType: placeFields.foodType.optional(),
    restaurant: placeFields.restaurant.optional(),
    location: placeFields.location.optional(),
  })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, { message: "바꿀 값이 없습니다." });

export const deadlineInput = z
  .object({ pollId: z.string().uuid(), respondBy: deadline, version: z.number().int().positive() })
  .strict();

export const voteInput = z
  .object({
    token: z.string().min(8).max(64),
    name: z.string().max(100),
    days: z.array(day).max(MAX_POLL_DAYS),
  })
  .strict();

/* ── 이름 ─────────────────────────────────────────────────── */

/** 제어문자·여러 칸 공백을 정리한다. React 가 이스케이프하므로 HTML 은 건드리지 않는다. */
export function cleanName(raw: string): string {
  return raw
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f​-‏‪-‮⁠﻿]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** 같은 사람이 공백·대소문자만 바꿔 다른 이름처럼 쓰는 것을 막는 비교 키. */
export function nameKey(name: string): string {
  return cleanName(name).replace(/\s/g, "").toLowerCase();
}

export function validName(name: string): string | null {
  const cleaned = cleanName(name);
  if (cleaned.length < 1) return "이름이나 닉네임을 적어 주세요.";
  if ([...cleaned].length > MAX_NAME_LENGTH) return `이름은 ${MAX_NAME_LENGTH}자까지예요.`;
  return null;
}

/* ── 후보일·마감 ──────────────────────────────────────────── */

export function candidateDays(rangeStart: string, rangeEnd: string, excluded: Iterable<string>): string[] {
  const out = new Set(excluded);
  return eachDay(rangeStart, rangeEnd).filter((d) => !out.has(d));
}

/**
 * 투표를 받는 중인가. 마감 시각은 DB 에 상태로 쓰지 않고(스케줄러가 없다) 조회할 때 계산한다.
 * 그래서 마감 연장은 respond_by 만 바꿔도 즉시 효과가 난다.
 */
export function isPollClosed(poll: { status: string; respondBy: Date | null }, now: Date = new Date()): boolean {
  if (poll.status !== "open") return true;
  return poll.respondBy !== null && poll.respondBy.getTime() <= now.getTime();
}

export type DeadlineCheck = { ok: true; status: "open" | "closed" | "confirmed" } | { ok: false; message: string };

/**
 * 마감 변경·연장·해제의 규칙(setDeadline).
 * - 확정된 투표는 건드리지 않는다. 먼저 확정을 취소해야 한다.
 * - 새 마감은 지금보다 뒤여야 한다. 해제(null)는 항상 된다.
 * - 닫혀 있던 투표라도 새 마감이 미래이거나 해제이면 다시 연다.
 */
export function checkDeadlineChange(
  current: { status: "open" | "closed" | "confirmed" },
  next: Date | null,
  now: Date = new Date(),
): DeadlineCheck {
  if (current.status === "confirmed") return { ok: false, message: "날짜가 확정된 투표예요. 먼저 확정을 취소해 주세요." };
  if (next && next.getTime() <= now.getTime()) return { ok: false, message: "지금보다 뒤의 시각을 골라 주세요." };
  return { ok: true, status: "open" };
}

/** "N일 H시간 남음". 지났으면 null. */
export function remainingLabel(until: Date, now: Date = new Date()): string | null {
  const ms = until.getTime() - now.getTime();
  if (ms <= 0) return null;
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  if (days > 0) return `${days}일 ${hours}시간 남음`;
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  return hours > 0 ? `${hours}시간 ${minutes}분 남음` : `${Math.max(minutes, 1)}분 남음`;
}

/* ── 집계 ─────────────────────────────────────────────────── */

export type Tally = {
  total: number;
  /** 후보일마다 가능한 사람 수 */
  available: Record<string, number>;
  /** 후보일마다 못 오는 사람 id — 소유자 화면에서 이름으로 바꿔 보여 준다 */
  unavailableBy: Record<string, string[]>;
  /** 가능 인원이 많은 순(동률이면 빠른 날) */
  ranked: string[];
  best: string | null;
};

/**
 * 제외일과 겹치는 불가 행은 무시한다 — 소유자가 제출 뒤에 제외일을 늘려도 집계가 흔들리지 않게.
 * 응답이 한 명도 없으면 best 는 null 이다(모든 날이 같은 점수라 추천이 무의미하다).
 */
export function tallyPoll(
  candidates: string[],
  participants: { id: string; unavailable: string[] }[],
): Tally {
  const total = participants.length;
  const set = new Set(candidates);
  const available: Record<string, number> = {};
  const unavailableBy: Record<string, string[]> = {};
  for (const d of candidates) { available[d] = total; unavailableBy[d] = []; }
  for (const p of participants) {
    for (const d of new Set(p.unavailable)) {
      if (!set.has(d)) continue;
      available[d] -= 1;
      unavailableBy[d].push(p.id);
    }
  }
  const ranked = [...candidates].sort((a, b) => available[b] - available[a] || (a < b ? -1 : 1));
  return { total, available, unavailableBy, ranked, best: total > 0 ? (ranked[0] ?? null) : null };
}

/* ── 캘린더 ───────────────────────────────────────────────── */

export type MonthCell = { day: string; inRange: boolean } | null;
export type MonthGrid = { month: string; label: string; cells: MonthCell[] };

/** 기간이 걸친 달마다 7열 격자를 만든다. 첫 주 앞쪽·마지막 주 뒤쪽은 null 로 채운다. */
export function buildMonths(rangeStart: string, rangeEnd: string): MonthGrid[] {
  const months: MonthGrid[] = [];
  let cursor = rangeStart.slice(0, 7);
  const last = rangeEnd.slice(0, 7);
  for (;;) {
    const first = `${cursor}-01`;
    const [y, m] = cursor.split("-").map(Number);
    const length = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const cells: MonthCell[] = [];
    for (let i = 0; i < weekday(first); i++) cells.push(null);
    for (let d = 1; d <= length; d++) {
      const iso = `${cursor}-${String(d).padStart(2, "0")}`;
      cells.push({ day: iso, inRange: iso >= rangeStart && iso <= rangeEnd });
    }
    while (cells.length % 7 !== 0) cells.push(null);
    months.push({ month: cursor, label: `${y}년 ${m}월`, cells });
    if (cursor === last) break;
    cursor = addDays(`${cursor}-28`, 7).slice(0, 7);
  }
  return months;
}
