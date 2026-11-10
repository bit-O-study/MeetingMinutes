"use client";

import { CalendarRange, Check, CircleAlert, Clock, LoaderCircle, MapPin, NotebookPen, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { createMeeting } from "@/lib/actions/meetings";
import { addDays, daysInclusive } from "@/lib/calendar-dates";
import { cn } from "@/lib/utils";

import { RangePicker } from "./RangePicker";

type Props = {
  spaceId: string;
  today: string;
  /** 주소의 ?new=1 로 바로 열 때 */
  defaultOpen?: boolean;
  /** 캘린더에서 날짜를 고른 채 넘어온 경우 후보 기간의 시작 */
  defaultStart?: string;
  preview?: boolean;
};

/** 입력칸: 라벨 대신 아이콘과 안내 문구(placeholder)로 말한다. 접근성 이름은 aria-label 로 둔다. */
const FIELD = "flex h-12 items-center gap-3 rounded-2xl bg-surface-2 px-3.5 focus-within:outline-2 focus-within:outline-accent";
const INPUT = "min-w-0 flex-1 bg-transparent text-[15px] font-semibold outline-none placeholder:font-medium placeholder:text-ink-3";

/** 일정 조사 만들기. 후보 기간은 달력에서 고르고, 이어지는 일수(하루~7일)를 정한다. */
export function MeetingCreate({ spaceId, today, defaultOpen = false, defaultStart, preview = false }: Props) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(defaultOpen);
  const startDay = defaultStart && defaultStart >= today ? defaultStart : today;
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [memo, setMemo] = useState("");
  const [showMemo, setShowMemo] = useState(false);
  const [showDeadline, setShowDeadline] = useState(false);
  const [range, setRange] = useState({ start: startDay, end: addDays(startDay, 13) });
  const [spanDays, setSpanDays] = useState(1);
  const [respondBy, setRespondBy] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  const length = daysInclusive(range.start, range.end);
  const spanOptions = Array.from({ length: Math.min(7, length) }, (_, index) => index + 1);

  function submit() {
    setError("");
    if (!title.trim()) return setError("모임 이름을 입력해 주세요.");
    if (spanDays > length) return setError(`후보 기간이 ${spanDays}일보다 짧아요.`);
    if (preview) return setOpen(false);
    startTransition(async () => {
      try {
        const result = await createMeeting({
          spaceId,
          title,
          location,
          memo,
          spanDays,
          windowStart: range.start,
          windowEnd: range.end,
          respondBy: respondBy ? `${respondBy}:00+09:00` : null,
        });
        if (!result.ok) return setError(result.message);
        setOpen(false);
        router.push(`/s/${spaceId}/m/${result.id}`);
      } catch {
        setError("만들지 못했어요. 연결을 확인하고 다시 시도해 주세요.");
      }
    });
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="일정 잡기" className="press inline-flex h-11 items-center gap-2 rounded-full bg-accent pl-4 pr-5 text-sm font-black text-on-accent shadow-md hover:brightness-105">
        <Plus className="size-5" strokeWidth={2.6} aria-hidden="true" />일정 잡기
      </button>
      <dialog
        ref={dialog}
        aria-labelledby="meeting-create-title"
        onClose={() => setOpen(false)}
        onCancel={(event) => {
          if (title.trim() && !pending) event.preventDefault();
          else setOpen(false);
        }}
        className="m-auto max-h-[calc(100dvh-1.5rem)] w-[30rem] max-w-[calc(100%-1.5rem)] overflow-y-auto rounded-[2rem] border-0 bg-surface p-0 text-ink shadow-[var(--shadow-float)] backdrop:bg-ink/40 backdrop:backdrop-blur-sm"
      >
        <form className="flex flex-col gap-4 p-5 md:p-6" onSubmit={(event) => { event.preventDefault(); submit(); }}>
          <div className="flex items-start gap-3">
            <h2 id="meeting-create-title" className="sr-only">일정 잡기</h2>
            <input
              autoFocus
              aria-label="모임 이름"
              value={title}
              maxLength={120}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="모임 이름"
              className="min-w-0 flex-1 bg-transparent py-1 text-[1.6rem] font-black leading-tight tracking-tight outline-none placeholder:text-ink-3/60"
            />
            <button type="button" aria-label="닫기" onClick={() => setOpen(false)} disabled={pending} className="press grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 hover:bg-line"><X className="size-5" /></button>
          </div>

          <RangePicker
            start={range.start}
            end={range.end}
            min={today}
            onChange={(start, end) => {
              setRange({ start, end });
              setSpanDays((current) => Math.min(current, daysInclusive(start, end)));
            }}
          />

          <div role="radiogroup" aria-label="한 번에 이어지는 일수" className="flex items-center gap-2">
            <CalendarRange aria-hidden="true" className="size-5 shrink-0 text-ink-3" />
            <div className="flex flex-1 gap-1.5 rounded-full bg-surface-2 p-1">
              {spanOptions.map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={spanDays === n}
                  aria-label={n === 1 ? "하루" : `연속 ${n}일`}
                  title={n === 1 ? "하루" : `연속 ${n}일 (${n - 1}박 ${n}일)`}
                  onClick={() => setSpanDays(n)}
                  className={cn("press h-9 flex-1 rounded-full text-sm font-black tabular-nums transition-colors", spanDays === n ? "bg-surface text-accent shadow-sm" : "text-ink-3 hover:text-ink")}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <label className={FIELD}>
            <MapPin aria-hidden="true" className="size-5 shrink-0 text-ink-3" />
            <input aria-label="장소" value={location} maxLength={200} onChange={(e) => setLocation(e.target.value)} placeholder="장소 또는 링크" className={INPUT} />
          </label>
          {showDeadline || respondBy ? (
            <label className={FIELD}>
              <Clock aria-hidden="true" className="size-5 shrink-0 text-ink-3" />
              <input aria-label="응답 마감" type="datetime-local" value={respondBy} onChange={(e) => setRespondBy(e.target.value)} className={cn(INPUT, "tabular-nums")} />
            </label>
          ) : (
            <button type="button" onClick={() => setShowDeadline(true)} aria-label="응답 마감 추가" className="press flex h-12 items-center gap-3 rounded-2xl px-3.5 text-ink-3 hover:bg-surface-2"><Clock aria-hidden="true" className="size-5" /><span className="text-[15px] font-medium">마감</span></button>
          )}
          {showMemo ? (
            <label className="flex gap-3 rounded-2xl bg-surface-2 p-3.5 focus-within:outline-2 focus-within:outline-accent">
              <NotebookPen aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-ink-3" />
              <textarea aria-label="메모" value={memo} maxLength={4000} rows={3} onChange={(e) => setMemo(e.target.value)} placeholder="메모" className="min-h-[4.5rem] min-w-0 flex-1 resize-none bg-transparent text-[15px] font-medium outline-none placeholder:text-ink-3" />
            </label>
          ) : (
            <button type="button" onClick={() => setShowMemo(true)} aria-label="메모 추가" className="press flex h-12 items-center gap-3 rounded-2xl px-3.5 text-ink-3 hover:bg-surface-2"><NotebookPen aria-hidden="true" className="size-5" /><span className="text-[15px] font-medium">메모</span></button>
          )}

          {error && <p role="alert" className="flex items-center gap-2 rounded-2xl bg-danger-soft px-3.5 py-2.5 text-sm font-semibold text-danger"><CircleAlert aria-hidden="true" className="size-4 shrink-0" />{error}</p>}
          <button type="submit" disabled={pending} aria-label="일정 조사 시작" className="press inline-flex h-13 items-center justify-center gap-2 rounded-full bg-accent text-base font-black text-on-accent shadow-md hover:brightness-105 disabled:opacity-50">
            {pending ? <LoaderCircle aria-hidden="true" className="size-5 animate-spin motion-reduce:animate-none" /> : <Check aria-hidden="true" className="size-5" strokeWidth={3} />}
            시작
          </button>
        </form>
      </dialog>
    </>
  );
}
