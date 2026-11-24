/**
 * 일정 투표 화면의 날짜·시각 표기. 전부 서울 시간 기준이고 서버·브라우저에서 같은 결과가 나온다.
 * (브라우저 시간대를 따르면 해외에서 연 사람에게 마감이 하루 어긋나 보인다.)
 */
import { addDays, weekday } from "./calendar-dates";

const WEEK = ["일", "월", "화", "수", "목", "금", "토"] as const;
const SEOUL = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

function seoulParts(date: Date) {
  const parts = Object.fromEntries(SEOUL.formatToParts(date).map((p) => [p.type, p.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: parts.hour, minute: parts.minute };
}

/** "2026-12-11" → "12월 11일 (금)" */
export function dayLabel(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${m}월 ${d}일 (${WEEK[weekday(iso)]})`;
}

/** 마감 시각 ISO → "11월 30일 (월) 18:00" (서울) */
export function deadlineLabel(iso: string): string {
  const p = seoulParts(new Date(iso));
  return `${dayLabel(p.day)} ${p.hour}:${p.minute}`;
}

/** 마감 시각 ISO → datetime-local 입력값 "2026-11-30T18:00" (서울) */
export function toSeoulLocal(iso: string): string {
  const p = seoulParts(new Date(iso));
  return `${p.day}T${p.hour}:${p.minute}`;
}

/** 서울 기준 오늘(YYYY-MM-DD)에 n일을 더한 날의 18:00 → datetime-local 입력값 */
export function seoulEvening(today: string, plusDays: number): string {
  return `${addDays(today, plusDays)}T18:00`;
}
