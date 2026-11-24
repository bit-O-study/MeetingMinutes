"use client";

import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { buttonClass, fieldClass } from "@/components/ui/Button";
import { createPoll } from "@/lib/actions/polls";
import { addDays, daysInclusive, eachDay, weekday } from "@/lib/calendar-dates";
import { dayLabel } from "@/lib/poll-format";
import { MAX_POLL_DAYS, remainingLabel, seoulLocalToIso } from "@/lib/polls";
import { cn } from "@/lib/utils";

import { HATCH, MonthGrids } from "./MonthGrids";
import { useNow } from "./useNow";

const LABEL = "flex flex-col gap-1.5 text-sm font-medium text-ink";

/**
 * 투표 만들기. 입력은 제목·모임 정보·기간·마감뿐이고, 달력은 "안 되는 날"을 누르는 것 하나만 한다.
 * 기간은 날짜 입력 두 칸으로 정한다(달력에서 구간을 잡는 모드 전환이 가장 헷갈렸다).
 */
export function PollCreate({ today }: { today: string }) {
  const router = useRouter();
  const now = useNow();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const [title, setTitle] = useState("");
  const [foodType, setFoodType] = useState("");
  const [restaurant, setRestaurant] = useState("");
  const [location, setLocation] = useState("");
  const [start, setStart] = useState(addDays(today, 1));
  const [end, setEnd] = useState(addDays(today, 14));
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [deadline, setDeadline] = useState("");

  // 기간 밖으로 밀려난 제외일은 저장하지 않는다.
  const excludedDays = useMemo(() => [...excluded].filter((d) => d >= start && d <= end).sort(), [excluded, start, end]);
  const candidates = daysInclusive(start, end) - excludedDays.length;
  const weekends = useMemo(() => eachDay(start, end).filter((d) => weekday(d) === 0 || weekday(d) === 6), [start, end]);
  const weekendsOut = weekends.length > 0 && weekends.every((d) => excluded.has(d));

  const deadlineIso = deadline ? seoulLocalToIso(deadline) : null;
  const past = Boolean(deadlineIso && now && new Date(deadlineIso).getTime() <= now.getTime());
  const left = deadlineIso && now && !past ? remainingLabel(new Date(deadlineIso), now) : null;
  const blocked = !title.trim() || candidates < 1 || past || (deadline !== "" && !deadlineIso);

  function changeStart(value: string) {
    if (!value) return;
    setStart(value);
    if (end < value) setEnd(value);
    else if (daysInclusive(value, end) > MAX_POLL_DAYS) setEnd(addDays(value, MAX_POLL_DAYS - 1));
  }

  function changeEnd(value: string) {
    if (!value) return;
    if (value < start) setStart(value);
    else if (daysInclusive(start, value) > MAX_POLL_DAYS) return setError(`기간은 ${MAX_POLL_DAYS}일까지예요`);
    setError("");
    setEnd(value);
  }

  function toggleDay(day: string) {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day); else next.add(day);
      return next;
    });
  }

  function toggleWeekends() {
    setExcluded((prev) => {
      const next = new Set(prev);
      for (const d of weekends) { if (weekendsOut) next.delete(d); else next.add(d); }
      return next;
    });
  }

  function submit() {
    setError("");
    startTransition(async () => {
      const result = await createPoll({
        title, foodType, restaurant, location,
        rangeStart: start,
        rangeEnd: end,
        excluded: excludedDays,
        respondBy: deadlineIso,
      });
      if (!result.ok) return setError(result.message);
      router.push(`/polls/${result.id}?created=1`);
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5 break-keep">
      <h1 className="text-2xl font-bold text-ink">새 일정 투표</h1>

      <section className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5">
        <label className={LABEL}>
          제목
          <input className={fieldClass} value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className={LABEL}>
            음식 종류
            <input className={fieldClass} value={foodType} maxLength={30} onChange={(e) => setFoodType(e.target.value)} placeholder="예: 한식" />
          </label>
          <label className={LABEL}>
            식당
            <input className={fieldClass} value={restaurant} maxLength={60} onChange={(e) => setRestaurant(e.target.value)} />
          </label>
          <label className={LABEL}>
            위치
            <input className={fieldClass} value={location} maxLength={100} onChange={(e) => setLocation(e.target.value)} placeholder="예: 합정" />
          </label>
        </div>
      </section>

      <section className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5">
        <div className="grid grid-cols-2 gap-3">
          <label className={LABEL}>
            시작일
            <input type="date" className={fieldClass} min={today} value={start} onChange={(e) => changeStart(e.target.value)} />
          </label>
          <label className={LABEL}>
            끝나는 날
            <input type="date" className={fieldClass} min={start} max={addDays(start, MAX_POLL_DAYS - 1)} value={end} onChange={(e) => changeEnd(e.target.value)} />
          </label>
        </div>

        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[15px] font-bold text-ink">안 되는 날을 누르세요</h2>
          <button type="button" onClick={toggleWeekends} className={buttonClass("ghost", "sm")}>{weekendsOut ? "주말 해제" : "주말 제외"}</button>
        </div>
        <MonthGrids
          start={start}
          end={end}
          gap="gap-1.5"
          cell={(day) => {
            const out = excluded.has(day);
            return (
              <button
                type="button"
                aria-pressed={out}
                aria-label={`${dayLabel(day)}${out ? ", 제외" : ""}`}
                onClick={() => toggleDay(day)}
                style={out ? HATCH : undefined}
                className={cn(
                  "h-12 rounded-xl text-[15px] ring-1 ring-inset focus-visible:outline-2 focus-visible:outline-accent",
                  out ? "text-ink-2 line-through ring-line-2" : "bg-accent-soft text-ink ring-accent-soft",
                )}
              >
                {Number(day.slice(8))}
              </button>
            );
          }}
        />
      </section>

      <section className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-5">
        <label className={LABEL}>
          마감 (선택)
          <div className="flex gap-2">
            <input type="datetime-local" className={cn(fieldClass, "flex-1")} min={`${today}T00:00`} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            {deadline && <button type="button" onClick={() => setDeadline("")} className={buttonClass("ghost")}>지우기</button>}
          </div>
        </label>
        {past && <span role="alert" className="text-sm text-danger">이미 지난 시각이에요</span>}
        {left && <span className="text-sm text-ink-2">{left}</span>}
      </section>

      <div className="sticky bottom-0 -mx-1 flex items-center justify-end gap-3 border-t border-line bg-ground/95 px-1 py-3 backdrop-blur">
        <span role={error ? "alert" : undefined} className={cn("mr-auto text-sm", error ? "text-danger" : "text-ink-2")}>
          {error || (candidates < 1 ? "후보일이 없어요" : `후보 ${candidates}일`)}
        </span>
        <button type="button" onClick={() => router.push("/polls")} className={buttonClass("ghost")}>취소</button>
        <button type="button" onClick={submit} disabled={blocked || pending} className={buttonClass("primary")}>
          {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}투표 만들기
        </button>
      </div>
    </div>
  );
}
