"use client";

import Link from "@/components/PendingLink";
import { Plus } from "lucide-react";

import { shortDay } from "@/lib/calendar-dates";
import { compareEntries, occursOnDay, type CalendarEntry } from "@/lib/calendar-entries";
import { cn } from "@/lib/utils";

import { entryAria, KIND_LABEL, layerStyle, timeLabel } from "./layer";

export type SpaceOption = { id: string; label: string };

type Props = {
  day: string;
  today: string;
  entries: CalendarEntry[];
  toneOf: (layerId: string) => number;
  layerLabel: (layerId: string) => string;
  spaces: SpaceOption[];
  pendingId: string | null;
  /** 제목 대신 "N일 · 요일" 한 줄 머리글만 쓰는 목록(주간 모바일)에서는 false */
  showCreate?: boolean;
  onOpenEntry: (entry: CalendarEntry) => void;
  onToggle: (entry: CalendarEntry, done: boolean) => void;
  onCreate: (kind: "event" | "task", day: string) => void;
};

function Shape({ entry }: { entry: CalendarEntry }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "mt-1 block size-3.5 shrink-0",
        entry.kind === "event" && "rounded-full bg-[var(--c)]",
        entry.kind === "meeting" && "rotate-45 rounded-[3px] bg-[var(--c)]",
        entry.kind === "poll" && "rounded-full border-2 border-dashed border-[var(--c)]",
      )}
    />
  );
}

function RelativeDay({ day, today }: { day: string; today: string }) {
  const diff = Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  const label = diff === 0 ? "오늘" : diff === 1 ? "내일" : diff === -1 ? "어제" : null;
  return label ? <span className="ml-2 text-sm font-bold text-accent">{label}</span> : null;
}

/** 선택한 날의 목록. 모바일에서는 캘린더 아래에 크게, 데스크톱에서는 오른쪽 패널로 쓴다. */
export function DayPanel({ day, today, entries, toneOf, layerLabel, spaces, pendingId, showCreate = true, onOpenEntry, onToggle, onCreate }: Props) {
  const list = entries.filter((entry) => occursOnDay(entry, day)).sort(compareEntries);
  return (
    <section aria-label={`${shortDay(day)} 일정`} className="flex flex-col gap-3">
      <header>
        <p className="font-mono text-xs font-medium tracking-wide text-accent">{shortDay(day)}</p>
        <h2 className="text-xl font-black">
          {list.length > 0 ? `${list.length}개` : "비어 있어요"}
          <RelativeDay day={day} today={today} />
        </h2>
      </header>

      {list.length > 0 && (
        <ul className="divide-y divide-line">
          {list.map((entry) => {
            const tone = toneOf(entry.layerId);
            const isTask = entry.kind === "task";
            const time = timeLabel(entry);
            const title = (
              <span className={cn("text-base font-bold leading-snug [overflow-wrap:anywhere]", entry.done && "text-ink-3 line-through")}>{entry.title}</span>
            );
            return (
              <li key={entry.id} style={layerStyle(tone)} className="flex gap-3 py-3">
                {isTask ? (
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={entry.done}
                    aria-label={`${entry.title} 완료`}
                    disabled={pendingId === entry.id}
                    onClick={() => onToggle(entry, !entry.done)}
                    className={cn(
                      "grid size-6 shrink-0 place-items-center rounded-lg border-2 border-[var(--c)] text-sm text-on-accent",
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50",
                      entry.done && "bg-[var(--c)]",
                    )}
                  >
                    {entry.done ? "✓" : ""}
                  </button>
                ) : (
                  <Shape entry={entry} />
                )}
                <div className="min-w-0 flex-1">
                  {entry.href ? (
                    <Link href={entry.href} aria-label={entryAria(entry)} className="block hover:underline">{title}</Link>
                  ) : (
                    <button type="button" onClick={() => onOpenEntry(entry)} aria-label={entryAria(entry)} className="block text-left hover:underline">{title}</button>
                  )}
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2 py-0.5 text-xs">
                      <i aria-hidden="true" className="size-2 rounded-full bg-[var(--c)]" />
                      {layerLabel(entry.layerId)}
                    </span>
                    <span>{KIND_LABEL[entry.kind]}</span>
                    {time && <span className="font-mono text-xs">{time}</span>}
                    {entry.start !== entry.end && <span>{entry.start.slice(5).replace("-", "/")} – {entry.end.slice(5).replace("-", "/")}</span>}
                    {entry.overdue && !entry.done && <span className="rounded-full bg-danger-soft px-2 py-0.5 text-xs font-bold text-danger">지연</span>}
                    {entry.note && <span className="min-w-0 [overflow-wrap:anywhere]">{entry.note}</span>}
                    {entry.linkTitle && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-bold text-accent [overflow-wrap:anywhere]">연결 · {entry.linkTitle}</span>}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {showCreate && (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => onCreate("event", day)} className="press inline-flex h-10 items-center gap-1.5 rounded-xl bg-surface px-3.5 text-sm font-bold text-ink ring-1 ring-inset ring-line hover:bg-surface-2">
            <Plus className="size-4" aria-hidden="true" />일정
          </button>
          <button type="button" onClick={() => onCreate("task", day)} className="press inline-flex h-10 items-center gap-1.5 rounded-xl bg-surface px-3.5 text-sm font-bold text-ink ring-1 ring-inset ring-line hover:bg-surface-2">
            <Plus className="size-4" aria-hidden="true" />할 일
          </button>
          {spaces.length > 0 && (
            <details className="relative">
              <summary className="press inline-flex h-10 cursor-pointer list-none items-center gap-1.5 rounded-xl bg-accent-soft px-3.5 text-sm font-bold text-accent">
                <Plus className="size-4" aria-hidden="true" />모임 잡기
              </summary>
              <ul className="absolute left-0 top-11 z-20 w-56 rounded-2xl bg-surface p-1.5 shadow-lg ring-1 ring-line">
                <li className="px-3 py-1.5 text-xs font-bold text-ink-3">어느 스페이스에서?</li>
                {spaces.map((space) => (
                  <li key={space.id}>
                    <Link href={`/s/${space.id}?tab=meetings&new=1&start=${day}`} className="block rounded-xl px-3 py-2 text-sm font-medium hover:bg-surface-2">{space.label}</Link>
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
