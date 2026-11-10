"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

import { addMonths, dayRangeLabel, daysInclusive, monthOf, shortDay } from "@/lib/calendar-dates";
import { isInMonth, monthWeeks, weekDays } from "@/lib/calendar-layout";
import { MAX_WINDOW_DAYS } from "@/lib/meetings";
import { cn } from "@/lib/utils";

type Props = {
  start: string;
  end: string;
  /** 이 날짜 이전은 고를 수 없다(오늘) */
  min: string;
  onChange: (start: string, end: string) => void;
};

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/**
 * 날짜 범위 고르기: 시작하는 날을 누르고, 끝나는 날을 누른다.
 * 하루만 고르려면 같은 날을 두 번 누른다. 달력만으로 고르고 입력칸은 두지 않는다.
 */
export function RangePicker({ start, end, min, onChange }: Props) {
  const [month, setMonth] = useState(monthOf(start || min));
  const [anchor, setAnchor] = useState<string | null>(null);
  const [note, setNote] = useState("");

  function pick(day: string) {
    if (day < min) return;
    setNote("");
    if (anchor === null) {
      setAnchor(day);
      onChange(day, day);
      return;
    }
    const [a, b] = day < anchor ? [day, anchor] : [anchor, day];
    if (daysInclusive(a, b) > MAX_WINDOW_DAYS) {
      setNote("후보 기간은 두 달 이내로 골라 주세요.");
      return;
    }
    setAnchor(null);
    onChange(a, b);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <button type="button" aria-label="이전 달" onClick={() => setMonth(addMonths(month, -1))} className="grid size-9 place-items-center rounded-lg ring-1 ring-inset ring-line hover:bg-surface-2"><ChevronLeft className="size-4" /></button>
        <p className="text-base font-black">{month.slice(0, 4)}년 {Number(month.slice(5))}월</p>
        <button type="button" aria-label="다음 달" onClick={() => setMonth(addMonths(month, 1))} className="grid size-9 place-items-center rounded-lg ring-1 ring-inset ring-line hover:bg-surface-2"><ChevronRight className="size-4" /></button>
      </div>
      <div role="grid" aria-label="후보 기간 고르기" className="select-none">
        <div role="row" className="grid grid-cols-7 text-center text-xs font-bold text-ink-3">
          {WEEKDAYS.map((w) => <div key={w} role="columnheader" className="py-1">{w}</div>)}
        </div>
        {monthWeeks(month).map((weekStart) => (
          <div key={weekStart} role="row" className="grid grid-cols-7">
            {weekDays(weekStart).map((day) => {
              const inRange = day >= start && day <= end;
              const edge = day === start || day === end;
              const disabled = day < min;
              return (
                <button
                  key={day}
                  type="button"
                  role="gridcell"
                  disabled={disabled}
                  aria-selected={inRange}
                  aria-label={shortDay(day)}
                  onClick={() => pick(day)}
                  className={cn(
                    "h-10 text-sm font-medium disabled:cursor-not-allowed disabled:text-ink-3/50",
                    "focus-visible:relative focus-visible:z-[1] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent",
                    !isInMonth(day, month) && !inRange && "text-ink-3",
                    inRange && !edge && "bg-accent-soft text-ink",
                    edge && "bg-accent font-bold text-on-accent",
                    day === start && day !== end && "rounded-l-xl",
                    day === end && day !== start && "rounded-r-xl",
                    day === start && day === end && "rounded-xl",
                  )}
                >
                  {Number(day.slice(8))}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <p role="status" className={cn("text-[13px]", note ? "font-bold text-danger" : "text-ink-2")}>
        {note || (anchor ? "끝나는 날을 눌러 주세요. 하루만이면 같은 날을 한 번 더 눌러요." : `후보 기간 ${dayRangeLabel(start, end)} · ${daysInclusive(start, end)}일`)}
      </p>
    </div>
  );
}
