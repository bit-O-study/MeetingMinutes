"use client";

import { CalendarRange, ChevronLeft, ChevronRight, CircleAlert } from "lucide-react";
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
  /** 하루만 고른다(누르면 바로 정해진다). 일정·할 일의 날짜 고르기에 쓴다. */
  single?: boolean;
  /** 달력의 읽기 이름 */
  label?: string;
  /** 기간 길이 상한(일). 모임은 두 달, 개인 일정은 넉넉하게. */
  maxDays?: number;
};

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/**
 * 날짜 범위 고르기: 시작하는 날을 누르고, 끝나는 날을 누른다.
 * 하루만 고르려면 같은 날을 두 번 누른다. 달력만으로 고르고 입력칸은 두지 않는다.
 */
export function RangePicker({ start, end, min, onChange, single = false, label = "후보 기간 고르기", maxDays = MAX_WINDOW_DAYS }: Props) {
  const [month, setMonth] = useState(monthOf(start || min));
  const [anchor, setAnchor] = useState<string | null>(null);
  const [note, setNote] = useState("");

  function pick(day: string) {
    if (day < min) return;
    setNote("");
    if (single) {
      onChange(day, day);
      return;
    }
    if (anchor === null) {
      setAnchor(day);
      onChange(day, day);
      return;
    }
    const [a, b] = day < anchor ? [day, anchor] : [anchor, day];
    if (daysInclusive(a, b) > maxDays) {
      setNote(maxDays === MAX_WINDOW_DAYS ? "두 달 이내로 골라 주세요" : "기간이 너무 길어요");
      return;
    }
    setAnchor(null);
    onChange(a, b);
  }

  return (
    <div className="flex flex-col gap-2 rounded-3xl bg-surface-2/60 p-3">
      <div className="flex items-center justify-between px-1">
        <button type="button" aria-label="이전 달" onClick={() => setMonth(addMonths(month, -1))} className="press grid size-9 place-items-center rounded-full bg-surface shadow-sm hover:bg-surface-2"><ChevronLeft className="size-4" /></button>
        <p className="text-base font-black">{month.slice(0, 4)}년 {Number(month.slice(5))}월</p>
        <button type="button" aria-label="다음 달" onClick={() => setMonth(addMonths(month, 1))} className="press grid size-9 place-items-center rounded-full bg-surface shadow-sm hover:bg-surface-2"><ChevronRight className="size-4" /></button>
      </div>
      <div role="grid" aria-label={label} className="select-none">
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
                    "relative h-10 text-sm font-semibold tabular-nums disabled:cursor-not-allowed disabled:text-ink-3/40",
                    "focus-visible:z-[1] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent",
                    !isInMonth(day, month) && !inRange && "text-ink-3",
                    inRange && !edge && "bg-accent-soft text-ink",
                    edge && "bg-accent font-black text-on-accent",
                    day === start && day !== end && "rounded-l-full",
                    day === end && day !== start && "rounded-r-full",
                    day === start && day === end && "rounded-full",
                  )}
                >
                  {Number(day.slice(8))}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <p role="status" className={cn("flex items-center gap-2 px-1 text-sm font-bold", note ? "text-danger" : "text-ink-2")}>
        {note ? <CircleAlert aria-hidden="true" className="size-4" /> : <CalendarRange aria-hidden="true" className="size-4 text-ink-3" />}
        {note || (single ? shortDay(start) : anchor ? "끝나는 날을 눌러 주세요" : `${dayRangeLabel(start, end)} · ${daysInclusive(start, end)}일`)}
      </p>
    </div>
  );
}
