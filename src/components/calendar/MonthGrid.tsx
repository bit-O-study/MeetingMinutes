"use client";

import type { CalendarEntry } from "@/lib/calendar-entries";
import { shortDay, weekdayLabel } from "@/lib/calendar-dates";
import { isInMonth, layoutWeek } from "@/lib/calendar-layout";
import { cn } from "@/lib/utils";

import { EntryChip } from "./EntryChip";

type Props = {
  month: string;
  weeks: string[];
  entries: CalendarEntry[];
  toneOf: (layerId: string) => number;
  selectedDay: string;
  today: string;
  /** 한 칸에 보여 줄 최대 줄 수. 넘치면 "+N"으로 접는다. */
  maxLanes?: number;
  onSelectDay: (day: string) => void;
  onOpenEntry: (entry: CalendarEntry) => void;
};

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/**
 * 데스크톱 월 보기.
 *
 * 주마다 격자 하나를 쓰고, 칸 배경(버튼) 위에 날짜 숫자와 일정을 같은 격자의 다른 행으로 올린다.
 * 기간 일정은 칸마다 글자를 반복하지 않고 여러 칸에 걸친 막대 하나로 그린다.
 * 배치는 calendar-layout 이 계산한 줄(lane)을 그대로 따라서 항목끼리 겹치지 않는다.
 * 칸 사이의 선은 없애고 여백으로 나눈다 — 표 같은 느낌을 줄이는 쪽이 더 정돈돼 보인다.
 */
export function MonthGrid({ month, weeks, entries, toneOf, selectedDay, today, maxLanes = 3, onSelectDay, onOpenEntry }: Props) {
  return (
    <div role="grid" aria-label={`${month.slice(0, 4)}년 ${Number(month.slice(5))}월 캘린더`} className="[--cell-h:8rem]">
      <div role="row" className="grid grid-cols-7 gap-x-1 px-3 pb-1 pt-3 text-xs font-bold text-ink-3">
        {WEEKDAYS.map((label, index) => (
          <div key={label} role="columnheader" className={cn("px-2 py-1.5", index === 0 && "text-danger/80")}>{label}</div>
        ))}
      </div>
      <div role="rowgroup" className="flex flex-col gap-1 px-3 pb-3">
        {weeks.map((weekStart) => {
          const layout = layoutWeek(entries, weekStart, maxLanes);
          return (
            <div
              key={weekStart}
              role="row"
              className="relative grid grid-cols-7 gap-x-1"
              style={{ gridTemplateRows: `auto repeat(${maxLanes + 1}, auto)` }}
            >
              {layout.days.map((day, col) => {
                const outside = !isInMonth(day, month);
                const selected = day === selectedDay;
                return (
                  <button
                    key={day}
                    type="button"
                    role="gridcell"
                    aria-selected={selected}
                    aria-label={`${shortDay(day)}${day === today ? ", 오늘" : ""}`}
                    onClick={() => onSelectDay(day)}
                    className={cn(
                      "z-0 min-h-[var(--cell-h)] rounded-2xl text-left transition-colors",
                      "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent",
                      outside ? "hover:bg-surface-2/60" : "bg-surface-2/55 hover:bg-surface-2",
                      selected && "bg-accent-soft ring-2 ring-inset ring-accent/40 hover:bg-accent-soft",
                    )}
                    style={{ gridColumn: col + 1, gridRow: "1 / -1" }}
                  />
                );
              })}
              {layout.days.map((day, col) => (
                <div
                  key={`n-${day}`}
                  aria-hidden="true"
                  className="pointer-events-none z-[1] flex items-center gap-1 px-2.5 pb-0.5 pt-2"
                  style={{ gridColumn: col + 1, gridRow: 1 }}
                >
                  <span
                    className={cn(
                      "grid min-w-7 place-items-center rounded-full px-1 text-sm leading-7 tabular-nums",
                      day === today ? "bg-accent font-black text-on-accent" : isInMonth(day, month) ? "font-bold text-ink" : "font-medium text-ink-3",
                    )}
                  >
                    {Number(day.slice(8))}
                  </span>
                  {Number(day.slice(8)) === 1 && <span className="text-[11px] font-bold text-ink-3">{Number(day.slice(5, 7))}월</span>}
                  <span className="sr-only">{weekdayLabel(day)}</span>
                </div>
              ))}
              {layout.segments.map((segment) => (
                <EntryChip
                  key={`${segment.entry.id}-${weekStart}`}
                  entry={segment.entry}
                  tone={toneOf(segment.entry.layerId)}
                  wrap={segment.col0 === segment.col1 && !segment.contLeft && !segment.contRight}
                  contLeft={segment.contLeft}
                  contRight={segment.contRight}
                  style={{ gridColumn: `${segment.col0 + 1} / ${segment.col1 + 2}`, gridRow: segment.lane + 2 }}
                  onOpen={onOpenEntry}
                />
              ))}
              {layout.hidden.map((count, col) =>
                count > 0 ? (
                  <button
                    key={`more-${col}`}
                    type="button"
                    aria-label={`${shortDay(layout.days[col])} 항목 ${count}개 더 보기`}
                    onClick={() => onSelectDay(layout.days[col])}
                    className="relative z-[1] mx-0.5 mt-1 w-fit rounded-full bg-surface px-2.5 py-0.5 text-left text-xs font-bold text-ink-2 shadow-sm hover:text-ink"
                    style={{ gridColumn: col + 1, gridRow: maxLanes + 2 }}
                  >
                    +{count}
                  </button>
                ) : null,
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
