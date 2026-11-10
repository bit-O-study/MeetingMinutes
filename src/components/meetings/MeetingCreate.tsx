"use client";

import { Plus } from "lucide-react";
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

const field = "h-11 w-full rounded-2xl bg-surface px-3.5 text-[15px] text-ink ring-1 ring-inset ring-line placeholder:text-ink-3 focus:ring-2 focus:ring-accent focus:outline-none";

/** 일정 조사 만들기. 후보 기간은 달력에서 고르고, 이어지는 일수(하루~7일)를 정한다. */
export function MeetingCreate({ spaceId, today, defaultOpen = false, defaultStart, preview = false }: Props) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(defaultOpen);
  const startDay = defaultStart && defaultStart >= today ? defaultStart : today;
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [memo, setMemo] = useState("");
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
      <button type="button" onClick={() => setOpen(true)} className="press inline-flex h-11 items-center gap-1.5 rounded-2xl bg-accent px-4 text-sm font-bold text-on-accent shadow-sm hover:brightness-105">
        <Plus className="size-4" aria-hidden="true" />일정 잡기
      </button>
      <dialog
        ref={dialog}
        aria-labelledby="meeting-create-title"
        onClose={() => setOpen(false)}
        onCancel={(event) => {
          if (title.trim() && !pending) event.preventDefault();
          else setOpen(false);
        }}
        className="m-auto max-h-[calc(100dvh-1.5rem)] w-[30rem] max-w-[calc(100%-1.5rem)] overflow-y-auto rounded-3xl border border-line bg-surface p-0 text-ink shadow-xl backdrop:bg-ink/45"
      >
        <form className="flex flex-col gap-4 p-5" onSubmit={(event) => { event.preventDefault(); submit(); }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="meeting-create-title" className="text-xl font-black">일정 잡기</h2>
              <p className="text-[13px] text-ink-2">후보 날짜를 정하면 멤버가 가능한 날을 칠해요.</p>
            </div>
            <button type="button" aria-label="닫기" onClick={() => setOpen(false)} disabled={pending} className="grid size-9 place-items-center rounded-xl text-lg text-ink-2 hover:bg-surface-2">×</button>
          </div>
          <label className="flex flex-col gap-1.5 text-[13px] font-bold"><span>모임 이름</span>
            <input autoFocus value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="예: 7회차 스터디, 송년회" className={cn(field, "font-normal")} />
          </label>
          <div className="flex flex-col gap-1.5">
            <p className="text-[13px] font-bold">후보 기간</p>
            <RangePicker start={range.start} end={range.end} min={today} onChange={(start, end) => { setRange({ start, end }); setSpanDays((current) => Math.min(current, daysInclusive(start, end))); }} />
          </div>
          <label className="flex flex-col gap-1.5 text-[13px] font-bold"><span>한 번에 이어지는 일수</span>
            <select value={spanDays} onChange={(e) => setSpanDays(Number(e.target.value))} className={cn(field, "font-normal")}>
              {spanOptions.map((n) => <option key={n} value={n}>{n === 1 ? "하루" : `연속 ${n}일 (${n - 1}박 ${n}일)`}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] font-bold"><span>장소 <span className="font-normal text-ink-3">선택</span></span>
            <input value={location} maxLength={200} onChange={(e) => setLocation(e.target.value)} placeholder="예: 강남 스터디룸, 화상회의 링크" className={cn(field, "font-normal")} />
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] font-bold"><span>메모 <span className="font-normal text-ink-3">선택</span></span>
            <textarea value={memo} maxLength={4000} rows={2} onChange={(e) => setMemo(e.target.value)} className="min-h-[4.5rem] w-full rounded-2xl bg-surface p-3.5 text-[15px] font-normal ring-1 ring-inset ring-line focus:ring-2 focus:ring-accent focus:outline-none" />
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] font-bold"><span>응답 마감 <span className="font-normal text-ink-3">선택 · 지나도 확정 전에는 답할 수 있어요</span></span>
            <input type="datetime-local" value={respondBy} onChange={(e) => setRespondBy(e.target.value)} className={cn(field, "font-normal")} />
          </label>
          {error && <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} disabled={pending} className="press inline-flex h-11 items-center rounded-2xl bg-surface px-4 text-sm font-bold ring-1 ring-inset ring-line">닫기</button>
            <button type="submit" disabled={pending} className="press inline-flex h-11 items-center rounded-2xl bg-accent px-5 text-sm font-bold text-on-accent disabled:opacity-50">{pending ? "만드는 중…" : "일정 조사 시작"}</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
