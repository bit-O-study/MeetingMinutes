"use client";

import { weekdayLabel } from "@/lib/calendar-dates";
import type { CalendarEntry } from "@/lib/calendar-entries";
import { layoutDayBlocks, layoutWeek, weekDays } from "@/lib/calendar-layout";
import { cn } from "@/lib/utils";

import { EntryChip } from "./EntryChip";

type Props = {
  weekStart: string;
  entries: CalendarEntry[];
  toneOf: (layerId: string) => number;
  today: string;
  selectedDay: string;
  onSelectDay: (day: string) => void;
  onOpenEntry: (entry: CalendarEntry) => void;
};

const HOUR_PX = 52;
const COLS = "grid grid-cols-[3.25rem_repeat(7,minmax(0,1fr))]";

/** 시각이 있고 하루에 끝나는 항목만 시간표에 올린다. 나머지는 위쪽 "종일" 띠에 둔다. */
function isTimedSingle(entry: CalendarEntry): boolean {
  return Boolean(entry.from && entry.to && entry.start === entry.end);
}

/**
 * 데스크톱 주간 보기. 시간이 있는 일정을 실제 길이로 보여 준다.
 * 시간이 겹치는 일정은 같은 열을 나눠 써서(layoutDayBlocks) 서로 가리지 않는다.
 */
export function WeekView({ weekStart, entries, toneOf, today, selectedDay, onSelectDay, onOpenEntry }: Props) {
  const days = weekDays(weekStart);
  const allDay = layoutWeek(entries.filter((entry) => !isTimedSingle(entry)), weekStart, 5);
  const perDay = days.map((day) => layoutDayBlocks(entries.filter((entry) => isTimedSingle(entry) && entry.start === day), 50));

  const all = perDay.flat();
  const startHour = Math.min(8, all.length ? Math.floor(Math.min(...all.map((block) => block.startMin)) / 60) : 8);
  const endHour = Math.max(22, all.length ? Math.ceil(Math.max(...all.map((block) => block.endMin)) / 60) : 22);
  const hours = Array.from({ length: endHour - startHour }, (_, index) => startHour + index);

  return (
    <div role="grid" aria-label="주간 캘린더" className="overflow-hidden">
      <div role="row" className={cn(COLS, "border-b border-line")}>
        <div />
        {days.map((day) => (
          <button
            key={day}
            type="button"
            role="columnheader"
            onClick={() => onSelectDay(day)}
            aria-label={`${Number(day.slice(5, 7))}월 ${Number(day.slice(8))}일 ${weekdayLabel(day)}요일`}
            className={cn("py-2 text-center text-[13px] font-bold text-ink-2", day === selectedDay && "bg-accent-soft")}
          >
            {weekdayLabel(day)}
            <span className={cn("mt-0.5 block text-lg font-black text-ink", day === today && "text-accent")}>{Number(day.slice(8))}</span>
          </button>
        ))}
      </div>

      <div
        role="row"
        className={cn(COLS, "border-b border-line py-1")}
        style={{ gridTemplateRows: `repeat(${Math.max(1, allDay.lanes + (allDay.hidden.some(Boolean) ? 1 : 0))}, auto)` }}
      >
        <div className="row-span-full px-2 pt-1 text-right font-mono text-[11.5px] text-ink-3">종일</div>
        {allDay.segments.map((segment) => (
          <EntryChip
            key={segment.entry.id}
            entry={segment.entry}
            tone={toneOf(segment.entry.layerId)}
            wrap={false}
            contLeft={segment.contLeft}
            contRight={segment.contRight}
            style={{ gridColumn: `${segment.col0 + 2} / ${segment.col1 + 3}`, gridRow: segment.lane + 1 }}
            onOpen={onOpenEntry}
          />
        ))}
        {allDay.hidden.map((count, col) =>
          count > 0 ? (
            <button
              key={`more-${col}`}
              type="button"
              onClick={() => onSelectDay(days[col])}
              className="mx-1 mt-0.5 rounded-md px-2 py-0.5 text-left text-[13px] font-bold text-ink-2 hover:bg-surface-2"
              style={{ gridColumn: col + 2, gridRow: allDay.lanes + 1 }}
            >
              +{count} 더 보기
            </button>
          ) : null,
        )}
      </div>

      <div role="row" className={COLS}>
        <div aria-hidden="true">
          {hours.map((hour) => (
            <div key={hour} className="pr-2 text-right font-mono text-[11.5px] text-ink-3" style={{ height: HOUR_PX }}>
              {String(hour).padStart(2, "0")}:00
            </div>
          ))}
        </div>
        {days.map((day, index) => (
          <div
            key={day}
            role="gridcell"
            className={cn("relative border-l border-line", day === selectedDay && "bg-accent-soft/50")}
            style={{
              height: hours.length * HOUR_PX,
              backgroundImage: "linear-gradient(to bottom, var(--line) 1px, transparent 1px)",
              backgroundSize: `100% ${HOUR_PX}px`,
            }}
          >
            {perDay[index].map((block) => (
              <EntryChip
                key={block.entry.id}
                entry={block.entry}
                tone={toneOf(block.entry.layerId)}
                wrap
                lines={block.endMin - block.startMin >= 75 ? 2 : 1}
                className="absolute m-0 overflow-hidden"
                style={{
                  top: ((block.startMin - startHour * 60) / 60) * HOUR_PX + 1,
                  height: ((block.endMin - block.startMin) / 60) * HOUR_PX - 2,
                  left: `calc(${(block.col / block.cols) * 100}% + 2px)`,
                  width: `calc(${100 / block.cols}% - 4px)`,
                }}
                onOpen={onOpenEntry}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
