"use client";

import Link from "@/components/PendingLink";
import type { CSSProperties } from "react";

import type { CalendarEntry } from "@/lib/calendar-entries";
import { cn } from "@/lib/utils";

import { entryAria, entryGlyph, layerStyle, timeLabel } from "./layer";

/** 종류별 모양: 일정=꽉 찬 막대, 할 일=테두리, 모임=연한 바탕+테두리, 투표 중=빗금 점선 */
const KIND_CLASS = {
  event: "bg-[var(--c)] text-on-accent",
  task: "border-[1.5px] border-[var(--c)] bg-surface text-ink",
  meeting: "border border-[var(--c)] bg-[color-mix(in_srgb,var(--c)_16%,var(--surface))] text-ink",
  poll: "border border-dashed border-[var(--c)] text-ink",
} as const;

const POLL_STRIPES = "repeating-linear-gradient(135deg, color-mix(in srgb, var(--c) 16%, var(--surface)) 0 6px, var(--surface) 6px 11px)";

type Props = {
  entry: CalendarEntry;
  tone: number;
  /** 하루짜리 칩은 두 줄까지 줄바꿈해 제목이 잘리지 않게 한다. 기간 막대는 한 줄. */
  wrap: boolean;
  /** 줄바꿈 칩의 제목 최대 줄 수. 짧은 시간 블록은 1줄로 줄여 글자가 블록 밖으로 나가지 않게 한다. */
  lines?: 1 | 2;
  contLeft?: boolean;
  contRight?: boolean;
  style?: CSSProperties;
  className?: string;
  onOpen: (entry: CalendarEntry) => void;
};

export function EntryChip({ entry, tone, wrap, lines = 2, contLeft, contRight, style, className, onOpen }: Props) {
  const glyph = entryGlyph(entry);
  const time = timeLabel(entry);
  const classes = cn(
    "relative z-[1] mx-1 mt-0.5 flex min-w-0 items-start gap-1 rounded-md px-1.5 py-[3px] text-left text-[13px] leading-tight",
    "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink",
    KIND_CLASS[entry.kind],
    // 앞·뒤 주로 이어지는 막대는 그쪽 모서리를 각지게 해서 "이어짐"을 보여 준다.
    contLeft && "ml-0 rounded-l-none",
    contRight && "mr-0 rounded-r-none",
    entry.done && "opacity-60",
    className,
  );
  const inner = (
    <>
      <span className={cn("min-w-0 flex-1", wrap ? "break-keep [overflow-wrap:anywhere]" : "truncate")}>
        <span className={cn("font-bold", wrap && (lines === 1 ? "line-clamp-1" : "line-clamp-2"), entry.done && "line-through")}>
          {glyph && <span aria-hidden="true">{glyph} </span>}
          {entry.title}
        </span>
        {time && wrap && <span className="block font-mono text-[11.5px] opacity-90">{time}</span>}
      </span>
      {time && !wrap && <span className="shrink-0 font-mono text-[11.5px] opacity-90">{time}</span>}
      {entry.overdue && !entry.done && <span className="shrink-0 text-[11px] font-bold text-danger">지연</span>}
    </>
  );
  const merged: CSSProperties = { ...layerStyle(tone), ...(entry.kind === "poll" ? { backgroundImage: POLL_STRIPES } : null), ...style };
  if (entry.href) {
    return (
      <Link href={entry.href} className={classes} style={merged} aria-label={entryAria(entry)} title={entry.title}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" className={classes} style={merged} aria-label={entryAria(entry)} title={entry.title} onClick={() => onOpen(entry)}>
      {inner}
    </button>
  );
}
