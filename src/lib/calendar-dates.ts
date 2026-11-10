/**
 * 날짜 문자열("YYYY-MM-DD") 계산. 시간대 영향을 받지 않도록 전부 UTC 자정으로 계산한다.
 * 캘린더·모임 화면과 서버가 같은 날짜 규칙을 쓰게 한 곳에 둔다.
 */
const DAY_MS = 86_400_000;

export const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDay(value: string): boolean {
  if (!ISO_DAY.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function toTime(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`);
}

export function fromTime(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  return fromTime(toTime(iso) + days * DAY_MS);
}

/** 양끝을 포함한 날짜 수. b가 a보다 앞이면 0. */
export function daysInclusive(a: string, b: string): number {
  return Math.max(0, Math.round((toTime(b) - toTime(a)) / DAY_MS) + 1);
}

/** a부터 b까지(양끝 포함) 모든 날짜. 비정상 입력은 빈 배열. */
export function eachDay(a: string, b: string): string[] {
  const count = daysInclusive(a, b);
  return Array.from({ length: count }, (_, index) => addDays(a, index));
}

/** 0=일요일 … 6=토요일 */
export function weekday(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

export function startOfWeek(iso: string): string {
  return addDays(iso, -weekday(iso));
}

export function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

export function addMonths(month: string, offset: number): string {
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 7);
}

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"] as const;
export function weekdayLabel(iso: string): string {
  return WEEKDAY_LABELS[weekday(iso)];
}

/** "11/12(목)" */
export function shortDay(iso: string): string {
  return `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}(${weekdayLabel(iso)})`;
}

/** "11/12(목) – 11/14(토)", 하루면 한 날짜만. */
export function dayRangeLabel(start: string, end: string): string {
  return start === end ? shortDay(start) : `${shortDay(start)} – ${shortDay(end)}`;
}
