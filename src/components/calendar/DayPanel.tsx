"use client";

import Link from "@/components/PendingLink";
import { AlarmClock, CalendarDays, CalendarPlus, CalendarRange, Check, Clock, Link2, ListPlus, Users } from "lucide-react";

import { shortDay, weekdayLabel } from "@/lib/calendar-dates";
import { compareEntries, occursOnDay, type CalendarEntry } from "@/lib/calendar-entries";
import { cn } from "@/lib/utils";

import { KindMark } from "./EntryChip";
import { entryAria, layerStyle, timeLabel } from "./layer";

export type SpaceOption = { id: string; label: string };

type Props = {
  day: string;
  today: string;
  entries: CalendarEntry[];
  toneOf: (layerId: string) => number;
  layerLabel: (layerId: string) => string;
  spaces: SpaceOption[];
  pendingId: string | null;
  /** 만들기 버튼을 숨길 때(주간 모바일의 하루별 목록) false */
  showCreate?: boolean;
  onOpenEntry: (entry: CalendarEntry) => void;
  onToggle: (entry: CalendarEntry, done: boolean) => void;
  onCreate: (kind: "event" | "task", day: string) => void;
};

function RelativeDay({ day, today }: { day: string; today: string }) {
  const diff = Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  const label = diff === 0 ? "오늘" : diff === 1 ? "내일" : diff === -1 ? "어제" : null;
  return label ? <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-bold text-accent">{label}</span> : null;
}

const PILL = "press inline-flex h-10 items-center gap-1.5 rounded-full bg-surface-2 px-4 text-sm font-bold text-ink hover:bg-accent-soft hover:text-accent";

/**
 * 선택한 날의 목록. 날짜를 크게 보이고, 각 항목은 옅은 색면 위에 아이콘·시각·연결을 한 줄로 얹는다.
 * 글자 라벨(레이어 이름, 종류 이름)은 빼고 점 색과 아이콘으로 대신한다. 정확한 이름은 읽어 주기·툴팁에서 알려 준다.
 */
export function DayPanel({ day, today, entries, toneOf, layerLabel, spaces, pendingId, showCreate = true, onOpenEntry, onToggle, onCreate }: Props) {
  const list = entries.filter((entry) => occursOnDay(entry, day)).sort(compareEntries);
  return (
    <section aria-label={`${shortDay(day)} 일정`} className="flex flex-col gap-4">
      <header className="flex items-end gap-2.5">
        <span className="text-[2.75rem] font-black leading-none tracking-tight tabular-nums">{Number(day.slice(8))}</span>
        <span className="pb-1 text-sm font-bold text-ink-2">{Number(day.slice(5, 7))}월 {weekdayLabel(day)}요일</span>
        <span className="pb-1"><RelativeDay day={day} today={today} /></span>
        {list.length > 0 && <span aria-label={`항목 ${list.length}개`} className="mb-1 ml-auto grid size-6 place-items-center rounded-full bg-surface-2 text-xs font-black text-ink-2">{list.length}</span>}
      </header>

      {list.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-3xl bg-surface-2/60 py-8 text-ink-3">
          <CalendarDays aria-hidden="true" className="size-7" strokeWidth={1.75} />
          <p className="text-sm font-semibold">비어 있어요</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((entry) => {
            const tone = toneOf(entry.layerId);
            const isTask = entry.kind === "task";
            const time = timeLabel(entry);
            const title = <span className={cn("text-base font-bold leading-snug [overflow-wrap:anywhere]", entry.done && "text-ink-3 line-through")}>{entry.title}</span>;
            return (
              <li
                key={entry.id}
                style={layerStyle(tone)}
                title={layerLabel(entry.layerId)}
                className="flex gap-3 rounded-2xl bg-[color-mix(in_srgb,var(--c)_9%,var(--surface))] p-3"
              >
                {isTask ? (
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={entry.done}
                    aria-label={`${entry.title} 완료`}
                    disabled={pendingId === entry.id}
                    onClick={() => onToggle(entry, !entry.done)}
                    className={cn(
                      "grid size-7 shrink-0 place-items-center rounded-full border-2 border-[var(--c)] text-on-accent transition-colors",
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50",
                      entry.done ? "bg-[var(--c)]" : "bg-surface",
                    )}
                  >
                    {entry.done && <Check aria-hidden="true" className="size-4" strokeWidth={3} />}
                  </button>
                ) : (
                  <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-full bg-surface">
                    <KindMark entry={entry} className="size-4" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  {entry.href ? (
                    <Link href={entry.href} aria-label={entryAria(entry)} className="block hover:underline">{title}</Link>
                  ) : (
                    <button type="button" onClick={() => onOpenEntry(entry)} aria-label={entryAria(entry)} className="block text-left hover:underline">{title}</button>
                  )}
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-ink-2">
                    {time && <span className="inline-flex items-center gap-1 font-mono"><Clock aria-hidden="true" className="size-3.5" />{time}</span>}
                    {entry.start !== entry.end && (
                      <span className="inline-flex items-center gap-1"><CalendarRange aria-hidden="true" className="size-3.5" />{entry.start.slice(5).replace("-", "/")}–{entry.end.slice(5).replace("-", "/")}</span>
                    )}
                    {entry.overdue && !entry.done && <span className="inline-flex items-center gap-1 font-bold text-danger"><AlarmClock aria-label="지연" className="size-3.5" /></span>}
                    {entry.note && <span className="min-w-0 [overflow-wrap:anywhere]">{entry.note}</span>}
                    {entry.linkTitle && (
                      <span className="inline-flex min-w-0 items-center gap-1 text-accent">
                        <Link2 aria-hidden="true" className="size-3.5 shrink-0" />
                        <span className="[overflow-wrap:anywhere]"><span className="sr-only">연결 · </span>{entry.linkTitle}</span>
                      </span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {showCreate && (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => onCreate("event", day)} className={PILL}>
            <CalendarPlus className="size-4" aria-hidden="true" />일정
          </button>
          <button type="button" onClick={() => onCreate("task", day)} className={PILL}>
            <ListPlus className="size-4" aria-hidden="true" />할 일
          </button>
          {spaces.length > 0 && (
            <details className="relative">
              <summary className={cn(PILL, "cursor-pointer list-none [&::-webkit-details-marker]:hidden")}>
                <Users className="size-4" aria-hidden="true" />모임
              </summary>
              <ul className="absolute left-0 top-12 z-20 w-56 rounded-2xl bg-surface p-1.5 shadow-[var(--shadow-float)]">
                {spaces.map((space) => (
                  <li key={space.id}>
                    <Link href={`/s/${space.id}?tab=meetings&new=1&start=${day}`} className="block rounded-xl px-3 py-2.5 text-sm font-semibold hover:bg-surface-2">{space.label}</Link>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </section>
  );
}
