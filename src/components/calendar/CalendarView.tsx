"use client";

import Link from "@/components/PendingLink";
import { AlarmClock, CalendarDays, CalendarPlus, CalendarRange, ChevronLeft, ChevronRight, Eye, EyeOff, ListChecks, ListPlus, Plus, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState, useTransition } from "react";

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
const ROUND = "press grid size-10 shrink-0 place-items-center rounded-full bg-surface text-ink shadow-sm hover:bg-surface-2";

/**
 * 통합 캘린더 화면.
 *
 * 데이터 모양과 배치 계산은 lib/calendar-* 가 맡고, 여기서는 상태(선택한 날, 꺼 둔 레이어, 편집 창)와
 * 화면 크기별 구성만 정한다. 모바일은 점 + 아래 목록, 데스크톱은 칩 격자 + 오른쪽 패널이다.
 * 글자는 제목과 날짜에만 쓰고, 나머지는 아이콘·색 점·숫자로 말한다.
 */
export function CalendarView({ data, linkTargets, view, anchorDay, preview = false }: Props) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [hidden, toggleHidden] = useStoredSet("moa.calendar.hidden");
  const [selectedDay, setSelectedDay] = useState(anchorDay);
  const [editor, setEditor] = useState<{ item: PlannerItem | null; kind: "event" | "task"; date: string } | null>(null);
  const menu = useRef<HTMLDetailsElement>(null);
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

  const create = useCallback((kind: "event" | "task", day: string) => {
    if (menu.current) menu.current.open = false;
    setEditor({ item: null, kind, date: day });
  }, []);

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
  const weekEnd = addDays(weekStart, 6);
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
    <div className="mx-auto flex w-full max-w-[84rem] flex-col gap-4 px-3 py-4 md:px-6 md:py-7">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <h1 className="flex items-baseline gap-2" aria-label={isWeek ? `${weekStart} 부터 ${weekEnd} 까지` : `${month.slice(0, 4)}년 ${Number(month.slice(5))}월`}>
          {isWeek ? (
            <span className="text-[2.1rem] font-black leading-none tracking-tight tabular-nums">{Number(weekStart.slice(5, 7))}.{Number(weekStart.slice(8))}<span className="mx-1.5 text-ink-3">–</span>{Number(weekEnd.slice(5, 7))}.{Number(weekEnd.slice(8))}</span>
          ) : (
            <>
              <span className="text-[2.5rem] font-black leading-none tracking-tight">{Number(month.slice(5))}월</span>
              <span className="text-base font-bold text-ink-3">{month.slice(0, 4)}</span>
            </>
          )}
        </h1>
        <div className="flex items-center gap-1.5">
          <Link href={prevHref} aria-label={isWeek ? "이전 주" : "이전 달"} className={ROUND}><ChevronLeft className="size-5" /></Link>
          <Link href={todayHref} aria-label="오늘로" className="press inline-flex h-10 items-center rounded-full bg-surface px-4 text-sm font-bold shadow-sm hover:bg-surface-2">오늘</Link>
          <Link href={nextHref} aria-label={isWeek ? "다음 주" : "다음 달"} className={ROUND}><ChevronRight className="size-5" /></Link>
        </div>
        <nav aria-label="보기 방식" className="inline-flex rounded-full bg-surface-2 p-1">
          <Link href={monthHref} aria-label="월 보기" title="월" aria-current={!isWeek ? "page" : undefined} className={cn("grid size-9 place-items-center rounded-full", !isWeek ? "bg-surface text-accent shadow-sm" : "text-ink-3 hover:text-ink")}><CalendarDays className="size-[1.15rem]" /></Link>
          <Link href={weekHref} aria-label="주 보기" title="주" aria-current={isWeek ? "page" : undefined} className={cn("grid size-9 place-items-center rounded-full", isWeek ? "bg-surface text-accent shadow-sm" : "text-ink-3 hover:text-ink")}><CalendarRange className="size-[1.15rem]" /></Link>
        </nav>

        <div className="ml-auto flex items-center gap-3">
          {summary && (
            <p className="flex items-center gap-3 text-sm font-black tabular-nums text-ink" aria-label={`오늘 일정 ${summary.events}개, 할 일 ${summary.tasks}개, 지연 ${summary.overdue}개`}>
              <span className="inline-flex items-center gap-1.5" title="오늘 일정"><CalendarDays aria-hidden="true" className="size-4 text-ink-3" />{summary.events}</span>
              <span className="inline-flex items-center gap-1.5" title="오늘 할 일"><ListChecks aria-hidden="true" className="size-4 text-ink-3" />{summary.tasks}</span>
              {summary.overdue > 0 && <span className="inline-flex items-center gap-1.5 text-danger" title="지연"><AlarmClock aria-hidden="true" className="size-4" />{summary.overdue}</span>}
            </p>
          )}
          <Link href="/tasks" aria-label="할 일 목록" title="할 일 목록" className={cn(ROUND, "max-sm:hidden")}><ListChecks className="size-[1.15rem]" /></Link>
          <details ref={menu} className="relative">
            <summary aria-label="새로 만들기" title="새로 만들기" className="press grid size-11 cursor-pointer list-none place-items-center rounded-full bg-accent text-on-accent shadow-md hover:brightness-105 [&::-webkit-details-marker]:hidden">
              <Plus className="size-5" strokeWidth={2.6} />
            </summary>
            <div className="absolute right-0 top-13 z-30 w-56 rounded-2xl bg-surface p-1.5 shadow-[var(--shadow-float)]">
              <button type="button" onClick={() => create("event", selectedDay)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold hover:bg-surface-2"><CalendarPlus className="size-[1.15rem] text-accent" aria-hidden="true" />일정</button>
              <button type="button" onClick={() => create("task", selectedDay)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold hover:bg-surface-2"><ListPlus className="size-[1.15rem] text-accent" aria-hidden="true" />할 일</button>
              {spaces.length > 0 && <p className="mx-3 mt-1 border-t border-line pt-2 text-xs font-bold text-ink-3">모임</p>}
              {spaces.map((space) => (
                <Link key={space.id} href={`/s/${space.id}?tab=meetings&new=1&start=${selectedDay}`} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold hover:bg-surface-2"><Users className="size-[1.15rem] text-accent" aria-hidden="true" /><span className="min-w-0 truncate">{space.label}</span></Link>
              ))}
            </div>
          </details>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="보여 줄 일정">
        {layers.map((layer) => {
          const on = !hidden.has(layer.id);
          return (
            <button
              key={layer.id}
              type="button"
              aria-pressed={on}
              onClick={() => toggleHidden(layer.id)}
              style={layerStyle(layer.tone)}
              className={cn(
                "press inline-flex min-h-9 items-center gap-2 rounded-full px-3.5 text-[13px] font-bold transition-colors",
                on ? "bg-[color-mix(in_srgb,var(--c)_14%,var(--surface))] text-ink" : "bg-transparent text-ink-3 hover:bg-surface-2",
              )}
            >
              <i aria-hidden="true" className={cn("size-2.5 rounded-full", on ? "bg-[var(--c)]" : "border-[1.5px] border-[var(--c)]")} />
              <span className={cn(!on && "line-through")}>{layer.label}</span>
            </button>
          );
        })}
        <button
          type="button"
          aria-pressed={hideDone}
          aria-label="완료한 할 일 숨기기"
          title="완료한 할 일 숨기기"
          onClick={() => toggleHidden(HIDE_DONE)}
          className={cn("press ml-1 grid size-9 place-items-center rounded-full transition-colors", hideDone ? "bg-accent-soft text-accent" : "text-ink-3 hover:bg-surface-2 hover:text-ink")}
        >
          {hideDone ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>

      {error && <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-2.5 text-sm font-semibold text-danger">{error}</p>}

      <div className={cn("grid gap-4", !isWeek && "lg:grid-cols-[minmax(0,1fr)_21rem]")}>
        <div className="min-w-0 overflow-hidden rounded-3xl bg-surface shadow-sm">
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
              <div className="flex flex-col gap-6 p-4">
                {weekDays(weekStart).map((day) => (
                  <DayPanel key={day} day={day} today={today} entries={entries} toneOf={toneOf} layerLabel={layerLabel} spaces={spaces} pendingId={pendingId} showCreate={false} onOpenEntry={open} onToggle={toggle} onCreate={create} />
                ))}
              </div>
            ) : (
              <div className="pt-2">
                <MobileMonth month={month} weeks={weeks} entries={entries} toneOf={toneOf} selectedDay={selectedDay} today={today} onSelectDay={setSelectedDay} />
              </div>
            )}
          </div>
        </div>

        <aside className={cn("min-w-0", isWeek && "max-lg:hidden")}>
          <div className={cn("rounded-3xl bg-surface p-5 shadow-sm", !isWeek && "lg:sticky lg:top-4")}>{panel}</div>
        </aside>
      </div>

      {editor && <PlannerEditor key={editor.item?.id ?? `new-${editor.kind}-${editor.date}`} item={editor.item} kind={editor.kind} date={editor.date} linkTargets={linkTargets} onClose={closeEditor} />}
    </div>
  );
}
