import type { CSSProperties } from "react";

import type { CalendarEntry, EntryKind } from "@/lib/calendar-entries";

/**
 * 레이어(개인·스페이스) 색. 새 hex 를 만들지 않고 프로젝트 색 토큰(--p-*)을 돌려 쓴다.
 * 토큰은 라이트·다크 값이 globals.css 에 이미 정의돼 있다.
 */
const TONES = ["var(--p-blue)", "var(--p-teal)", "var(--p-orange)", "var(--p-violet)", "var(--p-green)", "var(--p-pink)", "var(--p-yellow)", "var(--p-slate)"] as const;

export function toneColor(tone: number): string {
  return TONES[((tone % TONES.length) + TONES.length) % TONES.length];
}

/** 칩·점이 `var(--c)` 로 레이어 색을 읽게 하는 인라인 변수 */
export function layerStyle(tone: number): CSSProperties {
  return { "--c": toneColor(tone) } as CSSProperties;
}

export const KIND_LABEL: Record<EntryKind, string> = { event: "일정", task: "할 일", meeting: "모임", poll: "투표 중" };

/** 색을 못 보는 사람도 종류를 알 수 있게, 종류마다 모양을 다르게 그린다. */
export function entryGlyph(entry: Pick<CalendarEntry, "kind" | "done">): string {
  if (entry.kind === "task") return entry.done ? "☑" : "☐";
  if (entry.kind === "meeting") return "◆";
  return "";
}

export function timeLabel(entry: Pick<CalendarEntry, "from" | "to">): string | null {
  return entry.from && entry.to ? `${entry.from}–${entry.to}` : entry.from;
}

/** 스크린 리더용 한 줄: "할 일, 4장 읽기, 11/9–11/12, 지연" */
export function entryAria(entry: CalendarEntry): string {
  const range = entry.start === entry.end ? entry.start.slice(5).replace("-", "/") : `${entry.start.slice(5).replace("-", "/")}~${entry.end.slice(5).replace("-", "/")}`;
  const time = timeLabel(entry);
  return [KIND_LABEL[entry.kind], entry.title, range, time, entry.done ? "완료" : entry.overdue ? "지연" : null, entry.linkTitle ? `${entry.linkTitle}에 딸림` : null].filter(Boolean).join(", ");
}
