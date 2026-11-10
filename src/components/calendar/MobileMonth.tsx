"use client";

import type { CalendarEntry } from "@/lib/calendar-entries";
import { shortDay } from "@/lib/calendar-dates";
import { dayDots, isInMonth, weekDays } from "@/lib/calendar-layout";
import { cn } from "@/lib/utils";

import { layerStyle } from "./layer";

type Props = {
  month: string;
  weeks: string[];
  entries: CalendarEntry[];
  toneOf: (layerId: string) => number;
  selectedDay: string;
  today: string;
  onSelectDay: (day: string) => void;
};

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** 점 모양: 일정=채운 원, 할 일=빈 원, 모임=마름모, 투표 중=점선 원. 색은 레이어. */
function Dot({ entry, tone }: { entry: CalendarEntry; tone: number }) {
  return (
    <i
      aria-hidden="true"
      style={layerStyle(tone)}
      className={cn(
        "block size-[6px]",
        entry.kind === "event" && "rounded-full bg-[var(--c)]",
        entry.kind === "task" && "rounded-full border-[1.5px] border-[var(--c)]",
        entry.kind === "meeting" && "rotate-45 rounded-[2px] bg-[var(--c)]",
        entry.kind === "poll" && "rounded-full border-[1.5px] border-dashed border-[var(--c)]",
      )}
    />
  );
}

/**
 * 모바일 월 보기. 칸에는 날짜와 점만 둔다.
 * 글자를 칸에 욱여넣으면 8px 로 줄어 읽을 수 없어서, 선택한 날의 목록을 아래에 크게 펼치는 방식을 쓴다.
 */
export function MobileMonth({ month, weeks, entries, toneOf, selectedDay, today, onSelectDay }: Props) {
  return (
    <div role="grid" aria-label={`${month.slice(0, 4)}년 ${Number(month.slice(5))}월 캘린더`} className="px-3 pb-2">
      <div role="row" className="grid grid-cols-7 text-center text-xs font-bold text-ink-3">
        {WEEKDAYS.map((label, index) => (
          <div key={label} role="columnheader" className={cn("py-2", index === 0 && "text-danger/80")}>{label}</div>
        ))}
      </div>
      {weeks.map((weekStart) => (
        <div key={weekStart} role="row" className="grid grid-cols-7">
          {weekDays(weekStart).map((day) => {
            const selected = day === selectedDay;
            const { dots, extra } = dayDots(entries, day, 3);
            return (
              <button
                key={day}
                type="button"
                role="gridcell"
                aria-selected={selected}
                aria-label={`${shortDay(day)}${day === today ? ", 오늘" : ""}, 항목 ${dots.length + extra}개`}
                onClick={() => onSelectDay(day)}
                style={selected ? ({ "--c": "var(--on-accent)" } as React.CSSProperties) : undefined}
                className={cn(
                  "mx-auto my-0.5 flex h-[3.6rem] w-full max-w-[3.6rem] flex-col items-center justify-start gap-1 rounded-[1.4rem] pt-2 text-[15px] tabular-nums transition-colors",
                  "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
                  selected ? "bg-accent font-black text-on-accent shadow-md" : isInMonth(day, month) ? "font-bold text-ink" : "font-medium text-ink-3",
                  day === today && !selected && "bg-accent-soft text-accent",
                )}
              >
                <span>{Number(day.slice(8))}</span>
                <span className="flex h-2 items-center gap-[3px]">
                  {dots.map((entry) => (
                    <Dot key={entry.id} entry={entry} tone={toneOf(entry.layerId)} />
                  ))}
                  {extra > 0 && <span aria-hidden="true" className="text-[9px] font-black leading-none">+</span>}
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
