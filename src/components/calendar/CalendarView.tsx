"use client";

import Link from "@/components/PendingLink";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";

import { PlannerEditor } from "@/components/screens/PlannerEditor";
import { completePlannerItem } from "@/lib/actions/planner";
import { toggleTask } from "@/lib/actions/tasks";
import { addDays, addMonths, monthOf, startOfWeek } from "@/lib/calendar-dates";
import type { CalendarData } from "@/lib/calendar-data";
import { occursOnDay, PERSONAL_LAYER, type CalendarEntry, type LinkTarget } from "@/lib/calendar-entries";
import { monthWeeks, weekDays } from "@/lib/calendar-layout";
import type { PlannerItem } from "@/lib/planner";
import { cn } from "@/lib/utils";

import { DayPanel } from "./DayPanel";
import { layerStyle } from "./layer";
import { MobileMonth } from "./MobileMonth";
import { MonthGrid } from "./MonthGrid";
import { useStoredSet } from "./useStoredSet";
import { WeekView } from "./WeekView";

type Props = {
  data: CalendarData;
  linkTargets: LinkTarget[];
  view: "month" | "week";
  /** 월 보기에서는 처음 선택할 날, 주 보기에서는 보여 줄 주에 속한 날 */
  anchorDay: string;
  /** 서버 액션 없이 화면만 확인하는 개발용 미리보기에서 true */
  preview?: boolean;
};

const HIDE_DONE = "~done";

/**
 * 통합 캘린더 화면.
 *
 * 데이터 모양과 배치 계산은 lib/calendar-* 가 맡고, 여기서는 상태(선택한 날, 꺼 둔 레이어, 편집 창)와
 * 화면 크기별 구성만 정한다. 모바일은 점 + 아래 목록, 데스크톱은 막대·칩 격자 + 오른쪽 패널이다.
 */
export function CalendarView({ data, linkTargets, view, anchorDay, preview = false }: Props) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [hidden, toggleHidden] = useStoredSet("moa.calendar.hidden");
  const [selectedDay, setSelectedDay] = useState(anchorDay);
  const [editor, setEditor] = useState<{ item: PlannerItem | null; kind: "event" | "task"; date: string } | null>(null);
  const closeEditor = useCallback(() => setEditor(null), []);

  const { layers, today, month } = data;
  const toneById = useMemo(() => new Map(layers.map((layer) => [layer.id, layer.tone])), [layers]);
  const labelById = useMemo(() => new Map(layers.map((layer) => [layer.id, layer.label])), [layers]);
  const toneOf = useCallback((layerId: string) => toneById.get(layerId) ?? 0, [toneById]);
  const layerLabel = useCallback((layerId: string) => labelById.get(layerId) ?? "", [labelById]);
  const spaces = useMemo(() => layers.filter((layer) => layer.id !== PERSONAL_LAYER).map((layer) => ({ id: layer.id, label: layer.label })), [layers]);

  const hideDone = hidden.has(HIDE_DONE);
  const entries = useMemo(
    () => data.entries.filter((entry) => !hidden.has(entry.layerId) && !(hideDone && entry.kind === "task" && entry.done)),
    [data.entries, hidden, hideDone],
  );

  const weeks = useMemo(() => monthWeeks(month), [month]);
  const weekStart = startOfWeek(anchorDay);

  const open = useCallback(
    (entry: CalendarEntry) => {
      if (entry.source.type !== "planner") return;
      const item = data.planner.find((row) => row.id === (entry.source as { id: string }).id);
      if (item) setEditor({ item, kind: item.kind, date: selectedDay });
    },
    [data.planner, selectedDay],
  );

  const toggle = useCallback(
    (entry: CalendarEntry, done: boolean) => {
      if (preview) return;
      setError("");
      setPendingId(entry.id);
      startTransition(async () => {
        try {
          if (entry.source.type === "planner") {
            const result = await completePlannerItem({ id: entry.source.id, version: entry.source.version }, done);
            if (!result.ok) setError(result.error);
          } else if (entry.source.type === "task") {
            await toggleTask(entry.source.id);
          }
          router.refresh();
        } catch {
          setError("반영하지 못했습니다. 연결을 확인하고 다시 시도해 주세요.");
        } finally {
          setPendingId(null);
        }
      });
    },
    [preview, router],
  );

  const create = useCallback((kind: "event" | "task", day: string) => setEditor({ item: null, kind, date: day }), []);

  // 오늘 요약은 지금 보고 있는 달이 이번 달일 때만 의미가 있다.
  const summary = useMemo(() => {
    if (monthOf(today) !== month) return null;
    const todays = entries.filter((entry) => occursOnDay(entry, today));
    return {
      events: todays.filter((entry) => entry.kind === "event" || entry.kind === "meeting").length,
      tasks: todays.filter((entry) => entry.kind === "task" && !entry.done).length,
      overdue: entries.filter((entry) => entry.overdue && !entry.done).length,
    };
  }, [entries, month, today]);

  const isWeek = view === "week";
  const title = isWeek
    ? `${Number(weekStart.slice(5, 7))}월 ${Number(weekStart.slice(8))}일 – ${Number(addDays(weekStart, 6).slice(5, 7))}월 ${Number(addDays(weekStart, 6).slice(8))}일`
    : `${month.slice(0, 4)}년 ${Number(month.slice(5))}월`;
  const base = preview ? "/dev/calendar" : "/calendar";
  const prevHref = isWeek ? `${base}?view=week&day=${addDays(weekStart, -7)}` : `${base}?month=${addMonths(month, -1)}`;
  const nextHref = isWeek ? `${base}?view=week&day=${addDays(weekStart, 7)}` : `${base}?month=${addMonths(month, 1)}`;
  const todayHref = isWeek ? `${base}?view=week&day=${today}` : base;
  const monthHref = `${base}?month=${monthOf(selectedDay)}`;
  const weekHref = `${base}?view=week&day=${selectedDay}`;

  const panel = (
    <DayPanel
      day={selectedDay}
      today={today}
      entries={entries}
      toneOf={toneOf}
      layerLabel={layerLabel}
      spaces={spaces}
      pendingId={pendingId}
      onOpenEntry={open}
      onToggle={toggle}
      onCreate={create}
    />
  );

  return (
    <div className="mx-auto flex w-full max-w-[84rem] flex-col gap-3 px-3 py-4 md:px-5 md:py-6">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="mr-1 text-2xl font-black tracking-tight md:text-[1.75rem]">{title}</h1>
        <div className="flex items-center gap-1.5">
          <Link href={prevHref} aria-label={isWeek ? "이전 주" : "이전 달"} className="press grid size-10 place-items-center rounded-xl bg-surface ring-1 ring-inset ring-line hover:bg-surface-2"><ChevronLeft className="size-5" /></Link>
          <Link href={todayHref} className="press inline-flex h-10 items-center rounded-xl bg-surface px-3.5 text-sm font-bold ring-1 ring-inset ring-line hover:bg-surface-2">오늘</Link>
          <Link href={nextHref} aria-label={isWeek ? "다음 주" : "다음 달"} className="press grid size-10 place-items-center rounded-xl bg-surface ring-1 ring-inset ring-line hover:bg-surface-2"><ChevronRight className="size-5" /></Link>
        </div>
        <nav aria-label="보기 방식" className="inline-flex overflow-hidden rounded-xl ring-1 ring-inset ring-line-2">
          <Link href={monthHref} aria-current={!isWeek ? "page" : undefined} className={cn("px-3.5 py-2 text-sm font-bold", !isWeek ? "bg-accent text-on-accent" : "bg-surface text-ink-2")}>월</Link>
          <Link href={weekHref} aria-current={isWeek ? "page" : undefined} className={cn("px-3.5 py-2 text-sm font-bold", isWeek ? "bg-accent text-on-accent" : "bg-surface text-ink-2")}>주</Link>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Link href="/tasks" className="press hidden h-10 items-center rounded-xl bg-surface px-3.5 text-sm font-bold ring-1 ring-inset ring-line hover:bg-surface-2 sm:inline-flex">할 일 목록</Link>
          <button type="button" onClick={() => create("event", selectedDay)} className="press inline-flex h-10 items-center gap-1.5 rounded-xl bg-accent px-4 text-sm font-bold text-on-accent shadow-sm hover:brightness-105">
            <Plus className="size-4" aria-hidden="true" />새로 만들기
          </button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex flex-wrap gap-2" role="group" aria-label="보여 줄 일정">
          {layers.map((layer) => {
            const on = !hidden.has(layer.id);
            return (
              <button
                key={layer.id}
                type="button"
                aria-pressed={on}
                onClick={() => toggleHidden(layer.id)}
                style={layerStyle(layer.tone)}
                className={cn("inline-flex min-h-9 items-center gap-2 rounded-full px-3 text-sm font-medium ring-1 ring-inset", on ? "bg-surface text-ink ring-line-2" : "bg-transparent text-ink-3 ring-line")}
              >
                <i aria-hidden="true" className={cn("size-2.5 rounded-full", on ? "bg-[var(--c)]" : "border border-[var(--c)]")} />
                <span className={cn(!on && "line-through")}>{layer.label}</span>
              </button>
            );
          })}
          <button type="button" aria-pressed={hideDone} onClick={() => toggleHidden(HIDE_DONE)} className={cn("inline-flex min-h-9 items-center rounded-full px-3 text-sm font-medium ring-1 ring-inset", hideDone ? "bg-accent-soft text-accent ring-transparent" : "bg-surface text-ink-2 ring-line-2")}>
            완료한 할 일 숨기기
          </button>
        </div>
        {summary && (
          <p className="ml-auto text-sm text-ink-2">
            오늘 일정 <b className="text-ink">{summary.events}</b> · 할 일 <b className="text-ink">{summary.tasks}</b>
            {summary.overdue > 0 && <> · 지연 <b className="text-danger">{summary.overdue}</b></>}
          </p>
        )}
      </div>

      {error && <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

      <div className={cn("grid gap-4", !isWeek && "lg:grid-cols-[minmax(0,1fr)_20rem]")}>
        <div className="min-w-0 overflow-hidden rounded-2xl bg-surface ring-1 ring-line">
          {/* 큰 화면: 월 격자(768px~) / 주간 시간표(1024px~, 칸이 좁으면 겹친 일정을 읽을 수 없다) */}
          <div className={cn("hidden", isWeek ? "lg:block" : "md:block")}>
            {isWeek ? (
              <WeekView weekStart={weekStart} entries={entries} toneOf={toneOf} today={today} selectedDay={selectedDay} onSelectDay={setSelectedDay} onOpenEntry={open} />
            ) : (
              <MonthGrid month={month} weeks={weeks} entries={entries} toneOf={toneOf} selectedDay={selectedDay} today={today} onSelectDay={setSelectedDay} onOpenEntry={open} />
            )}
          </div>
          {/* 작은 화면: 점이 찍힌 월 + 아래 목록. 주 보기는 하루씩 쌓은 목록 */}
          <div className={isWeek ? "lg:hidden" : "md:hidden"}>
            {isWeek ? (
              <div className="divide-y divide-line px-4 py-2">
                {weekDays(weekStart).map((day) => (
                  <div key={day} className="py-3">
                    <DayPanel day={day} today={today} entries={entries} toneOf={toneOf} layerLabel={layerLabel} spaces={spaces} pendingId={pendingId} showCreate={false} onOpenEntry={open} onToggle={toggle} onCreate={create} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-2">
                <MobileMonth month={month} weeks={weeks} entries={entries} toneOf={toneOf} selectedDay={selectedDay} today={today} onSelectDay={setSelectedDay} />
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-line px-4 py-3 text-[13px] text-ink-2">
            <span className="inline-flex items-center gap-1.5"><i aria-hidden="true" className="h-3.5 w-6 rounded bg-ink-2" />일정</span>
            <span className="inline-flex items-center gap-1.5"><i aria-hidden="true" className="h-3.5 w-6 rounded border-[1.5px] border-ink-2" />할 일</span>
            <span className="inline-flex items-center gap-1.5"><i aria-hidden="true" className="h-3.5 w-6 rounded border border-ink-2 bg-surface-2" />모임</span>
            <span className="inline-flex items-center gap-1.5"><i aria-hidden="true" className="h-3.5 w-6 rounded border border-dashed border-ink-2 bg-[repeating-linear-gradient(135deg,var(--surface-2)_0_5px,var(--surface)_5px_9px)]" />투표 중인 후보 기간</span>
          </div>
        </div>

        <aside className={cn("min-w-0", isWeek && "max-lg:hidden")}>
          <div className={cn("rounded-2xl bg-surface p-4 ring-1 ring-line", !isWeek && "lg:sticky lg:top-4")}>{panel}</div>
        </aside>
      </div>

      {editor && <PlannerEditor key={editor.item?.id ?? `new-${editor.kind}-${editor.date}`} item={editor.item} kind={editor.kind} date={editor.date} linkTargets={linkTargets} onClose={closeEditor} />}
    </div>
  );
}
