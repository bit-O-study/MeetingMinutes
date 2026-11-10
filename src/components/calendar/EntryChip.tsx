"use client";

import Link from "@/components/PendingLink";
import { AlarmClock, Circle, CircleCheck, Users, Vote } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

import type { CalendarEntry } from "@/lib/calendar-entries";
import { cn } from "@/lib/utils";

import { entryAria, layerStyle, timeLabel } from "./layer";

/**
 * 종류는 모양이 아니라 앞의 작은 아이콘으로 알린다. 면은 레이어 색을 옅게 풀어 쓰고,
 * 진한 색은 아이콘 하나에만 쓴다. 테두리를 없애서 격자 위에서 덜 시끄럽다.
 */
const SURFACE = {
  event: "bg-[color-mix(in_srgb,var(--c)_17%,var(--surface))]",
  meeting: "bg-[color-mix(in_srgb,var(--c)_26%,var(--surface))]",
  task: "bg-transparent hover:bg-[color-mix(in_srgb,var(--c)_10%,var(--surface))]",
  poll: "bg-[repeating-linear-gradient(135deg,color-mix(in_srgb,var(--c)_14%,var(--surface))_0_5px,color-mix(in_srgb,var(--c)_5%,var(--surface))_5px_10px)]",
} as const;

export function KindMark({ entry, className }: { entry: Pick<CalendarEntry, "kind" | "done">; className?: string }) {
  const size = cn("size-3.5 shrink-0 text-[var(--c)]", className);
  if (entry.kind === "task") return entry.done ? <CircleCheck aria-hidden="true" className={size} /> : <Circle aria-hidden="true" className={size} strokeWidth={2.4} />;
  if (entry.kind === "meeting") return <Users aria-hidden="true" className={size} />;
  if (entry.kind === "poll") return <Vote aria-hidden="true" className={size} />;
  return <i aria-hidden="true" className="block size-2.5 shrink-0 rounded-full bg-[var(--c)]" />;
}

type Props = {
  entry: CalendarEntry;
  tone: number;
  /** 하루짜리 칩은 두 줄까지 줄바꿈해 제목이 잘리지 않게 한다. 기간 막대는 한 줄. */
  wrap: boolean;
  /** 줄바꿈 칩의 제목 최대 줄 수. 짧은 시간 블록은 1줄로 줄여 글자가 블록 밖으로 나가지 않게 한다. */
  lines?: 1 | 2;
  /** 좁은 칸(겹친 시간 블록)에서는 "12:00–13:00" 대신 시작 시각만 보여 줘 줄바꿈으로 블록을 넘치지 않게 한다. */
  shortTime?: boolean;
  contLeft?: boolean;
  contRight?: boolean;
  style?: CSSProperties;
  className?: string;
  children?: ReactNode;
  onOpen: (entry: CalendarEntry) => void;
};

export function EntryChip({ entry, tone, wrap, lines = 2, shortTime = false, contLeft, contRight, style, className, onOpen }: Props) {
  const time = shortTime ? entry.from : timeLabel(entry);
  const classes = cn(
    "relative z-[1] mx-0.5 mt-1 flex min-w-0 items-start gap-1.5 rounded-lg px-2 py-1 text-left text-[13px] leading-tight text-ink",
    "transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
    SURFACE[entry.kind],
    // 앞·뒤 주로 이어지는 막대는 그쪽 모서리를 각지게 해서 "이어짐"을 보여 준다.
    contLeft && "ml-0 rounded-l-none",
    contRight && "mr-0 rounded-r-none",
    entry.done && "opacity-55",
    className,
  );
  const inner = (
    <>
      <span className="flex h-[1.15em] items-center"><KindMark entry={entry} /></span>
      <span className={cn("min-w-0 flex-1", wrap ? "break-keep [overflow-wrap:anywhere]" : "truncate")}>
        <span className={cn("font-semibold", wrap && (lines === 1 ? "line-clamp-1" : "line-clamp-2"), entry.done && "line-through")}>{entry.title}</span>
        {time && wrap && <span className="block whitespace-nowrap font-mono text-[11px] text-ink-2">{time}</span>}
      </span>
      {time && !wrap && <span className="shrink-0 font-mono text-[11px] text-ink-2">{time}</span>}
      {entry.overdue && !entry.done && <AlarmClock aria-label="지연" className="mt-px size-3.5 shrink-0 text-danger" />}
    </>
  );
  const merged: CSSProperties = { ...layerStyle(tone), ...style };
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
