"use client";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { CalendarDays, CalendarRange, Check, CircleAlert, CircleDashed, Clock, Link2, ListChecks, LoaderCircle, NotebookPen, Sun, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";

import { RangePicker } from "@/components/meetings/RangePicker";
import { deletePlannerItem, savePlannerItem } from "@/lib/actions/planner";
import type { LinkTarget } from "@/lib/calendar-entries";
import { plannerInput, type PlannerInput, type PlannerItem } from "@/lib/planner";
import { cn } from "@/lib/utils";

/** 입력칸은 라벨 대신 아이콘과 안내 문구로 말한다. 접근성 이름은 aria-label 로 둔다. */
const FIELD = "flex h-12 items-center gap-3 rounded-2xl bg-surface-2 px-3.5 focus-within:outline-2 focus-within:outline-accent";
const INPUT = "min-w-0 flex-1 bg-transparent text-[15px] font-semibold tabular-nums outline-none placeholder:font-medium placeholder:text-ink-3";
const PILL = "press inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full text-sm font-bold transition-colors";

/**
 * 개인 일정·할 일 편집 창.
 *
 * 저장 규칙은 그대로다: 새 항목은 "저장"으로 한 번에, 기존 항목은 입력이 멈추면 자동 저장한다.
 * 화면은 모임 만들기와 같은 말투로 맞췄다 — 큰 제목 입력, 달력으로 날짜 고르기, 아이콘 입력칸.
 */
export function PlannerEditor({ item, kind, date, onClose, linkTargets = [] }: { item: PlannerItem | null; kind: "event" | "task"; date: string; onClose: () => void; linkTargets?: LinkTarget[] }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState<PlannerInput>(() => item ? { kind: item.kind, title: item.title, memo: item.memo, mode: item.mode, startDate: item.startDate, endDate: item.endDate, date: item.date, from: item.from, to: item.to, allDay: item.allDay, linkedItemId: item.linkedItemId ?? null, linkedMeetingId: item.linkedMeetingId ?? null } : { kind, title: "", memo: "", mode: kind === "event" ? "fixed" : "range", startDate: null, endDate: date, date, from: "14:00", to: "15:00", allDay: false, linkedItemId: null, linkedMeetingId: null });
  const identity = useRef({ id: item?.id || "", version: item?.version || 0 });
  const [saved, setSaved] = useState(() => JSON.stringify(form));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [savedLabel, setSavedLabel] = useState(item ? "자동 저장됨" : "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showMemo, setShowMemo] = useState(Boolean(item?.memo));
  const dirty = JSON.stringify(form) !== saved;
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    if (!dirty && !pending) return;
    const before = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [dirty, pending]);
  function change<K extends keyof PlannerInput>(key: K, value: PlannerInput[K]) { setForm(current => ({ ...current, [key]: value })); setError(""); setSavedLabel(""); }
  const persist = useCallback((close = false) => {
    const parsed = plannerInput.safeParse(form);
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    if (!identity.current.id) identity.current.id = crypto.randomUUID();
    const snapshot = JSON.stringify(form);
    startTransition(async () => {
      try {
        const result = await savePlannerItem(identity.current, parsed.data);
        if (!result.ok) { setError(result.error); return; }
        if (result.item) identity.current = { id: result.item.id, version: result.item.version };
        setSaved(snapshot); setSavedLabel("자동 저장됨"); setError("");
        router.refresh();
        if (close) onClose();
      } catch { setError("저장하지 못했습니다. 연결을 확인하고 다시 시도해 주세요."); }
    });
  }, [form, onClose, router]);
  useEffect(() => {
    if (!item || !dirty || pending || error || !plannerInput.safeParse(form).success) return;
    const timer = setTimeout(() => persist(), 900);
    return () => clearTimeout(timer);
  }, [item, dirty, pending, error, form, persist]);
  function close() {
    if (pending) return;
    if (item && dirty) { persist(true); return; }
    if (!item && form.title.trim()) { setError("작성 중인 내용이 있습니다. 등록하거나 입력 취소를 선택해 주세요."); return; }
    onClose();
  }
  function remove() {
    startTransition(async () => {
      try {
        const result = await deletePlannerItem(identity.current);
        if (!result.ok) { setError(result.error); return; }
        router.refresh(); onClose();
      } catch { setError("삭제하지 못했습니다. 다시 시도해 주세요."); }
    });
  }
  const empty = (value: string) => value || null;

  const isEvent = form.kind === "event";
  const modes = isEvent
    ? ([["fixed", "하루", CalendarDays], ["range", "기간", CalendarRange]] as const)
    : ([["range", "기간", CalendarRange], ["fixed", "시간", Clock], ["none", "미정", CircleDashed]] as const);
  function pickMode(mode: PlannerInput["mode"]) {
    setForm(current => isEvent
      ? (mode === "range"
        ? { ...current, mode, startDate: current.startDate || current.date || date, endDate: current.endDate || current.date || date, allDay: false }
        : { ...current, mode, date: current.date || current.startDate || date, from: current.from || "14:00", to: current.to || "15:00" })
      : { ...current, mode, endDate: current.endDate || date, date: current.date || date, from: current.from || "14:00", to: current.to || "15:00" });
    setError(""); setSavedLabel("");
  }
  const rangeStart = form.startDate || form.endDate || form.date || date;
  const rangeEnd = form.endDate || form.date || date;
  const KindIcon = isEvent ? CalendarDays : ListChecks;

  return <dialog ref={dialog} aria-labelledby="planner-editor-title" onCancel={event => { event.preventDefault(); close(); }}
    className="m-auto max-h-[calc(100dvh-1.5rem)] w-[30rem] max-w-[calc(100%-1.5rem)] overflow-y-auto rounded-[2rem] border-0 bg-surface p-0 text-ink shadow-[var(--shadow-float)] backdrop:bg-ink/40 backdrop:backdrop-blur-sm">
    <form className="flex flex-col gap-4 p-5 md:p-6" onSubmit={event => { event.preventDefault(); persist(!item); }}>
      <h2 id="planner-editor-title" className="sr-only">{item ? "" : "새 "}{isEvent ? "개인 일정" : "할 일"}</h2>
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent"><KindIcon className="size-5" /></span>
        <input autoFocus aria-label="제목" value={form.title} maxLength={160} required disabled={pending} onChange={e => change("title", e.target.value)} placeholder={isEvent ? "일정 이름" : "할 일"}
          className="min-w-0 flex-1 bg-transparent py-1 text-[1.5rem] font-black leading-tight tracking-tight outline-none placeholder:text-ink-3/60" />
        <button type="button" aria-label="닫기" onClick={close} disabled={pending} className="press grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 hover:bg-line"><X className="size-5" /></button>
      </div>

      <fieldset disabled={pending} className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0">
        <div role="group" aria-label="날짜 방식" className="flex gap-1 rounded-full bg-surface-2 p-1">
          {modes.map(([mode, label, Icon]) => (
            <button key={mode} type="button" aria-pressed={form.mode === mode} onClick={() => pickMode(mode)}
              className={cn(PILL, form.mode === mode ? "bg-surface text-accent shadow-sm" : "text-ink-3 hover:text-ink")}>
              <Icon aria-hidden="true" className="size-4" />{label}
            </button>
          ))}
        </div>

        {form.mode === "range" && (
          <RangePicker
            label="날짜 고르기"
            start={rangeStart}
            end={rangeEnd}
            min="2000-01-01"
            maxDays={366}
            onChange={(a, b) => {
              // 할 일은 마감일 하나만 정해도 된다(시작일 없음). 일정은 시작·종료가 모두 있어야 한다.
              setForm(current => ({ ...current, startDate: isEvent || a !== b ? a : null, endDate: b }));
              setError(""); setSavedLabel("");
            }}
          />
        )}

        {form.mode === "fixed" && (
          <>
            <RangePicker label="날짜 고르기" single start={form.date || date} end={form.date || date} min="2000-01-01" onChange={a => change("date", a)} />
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" aria-pressed={form.allDay} onClick={() => change("allDay", !form.allDay)}
                className={cn("press inline-flex h-12 shrink-0 items-center gap-2 rounded-2xl px-4 text-sm font-bold transition-colors", form.allDay ? "bg-accent-soft text-accent" : "bg-surface-2 text-ink-3 hover:text-ink")}>
                <Sun aria-hidden="true" className="size-4" />종일
              </button>
              {!form.allDay && (
                <div className={cn(FIELD, "min-w-[17rem] flex-1 gap-2")}>
                  <Clock aria-hidden="true" className="size-5 shrink-0 text-ink-3" />
                  <input type="time" aria-label="시작 시간" value={form.from || ""} required onChange={e => change("from", empty(e.target.value))} className={INPUT} />
                  <span aria-hidden="true" className="text-ink-3">–</span>
                  <input type="time" aria-label="종료 시간" value={form.to || ""} required onChange={e => change("to", empty(e.target.value))} className={INPUT} />
                </div>
              )}
            </div>
          </>
        )}

        {form.kind === "task" && linkTargets.length > 0 && (
          <label className={FIELD}>
            <Link2 aria-hidden="true" className="size-5 shrink-0 text-ink-3" />
            <select aria-label="딸린 일정" className={cn(INPUT, "cursor-pointer")} value={form.linkedItemId ? `event:${form.linkedItemId}` : form.linkedMeetingId ? `meeting:${form.linkedMeetingId}` : ""}
              onChange={e => { const [k, id] = e.target.value.split(":"); setForm(current => ({ ...current, linkedItemId: k === "event" ? id : null, linkedMeetingId: k === "meeting" ? id : null })); setError(""); setSavedLabel(""); }}>
              <option value="">딸린 일정 없음</option>
              {linkTargets.map(target => <option key={target.kind + target.id} value={`${target.kind}:${target.id}`}>{target.kind === "meeting" ? "모임" : "일정"} · {target.title} ({target.when})</option>)}
            </select>
          </label>
        )}

        {showMemo || form.memo ? (
          <label className="flex gap-3 rounded-2xl bg-surface-2 p-3.5 focus-within:outline-2 focus-within:outline-accent">
            <NotebookPen aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-ink-3" />
            <textarea aria-label="메모" value={form.memo} maxLength={4000} rows={3} onChange={e => change("memo", e.target.value)} placeholder="메모" className="min-h-[4.5rem] min-w-0 flex-1 resize-none bg-transparent text-[15px] font-medium outline-none placeholder:text-ink-3" />
          </label>
        ) : (
          <button type="button" onClick={() => setShowMemo(true)} aria-label="메모 추가" className="press flex h-12 items-center gap-3 rounded-2xl px-3.5 text-ink-3 hover:bg-surface-2"><NotebookPen aria-hidden="true" className="size-5" /><span className="text-[15px] font-medium">메모</span></button>
        )}
      </fieldset>

      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-2xl bg-danger-soft px-3.5 py-2.5 text-sm font-semibold text-danger">
          <CircleAlert aria-hidden="true" className="size-4 shrink-0" /><span className="min-w-0 flex-1">{error}</span>
          {item && <button type="button" onClick={() => persist()} disabled={pending} className="shrink-0 underline">다시 시도</button>}
        </div>
      )}

      {confirmDelete ? (
        <div role="alertdialog" aria-label="삭제 확인" className="rounded-2xl bg-danger-soft p-3">
          <p className="flex items-center gap-2 text-sm font-bold text-danger"><CircleAlert aria-hidden="true" className="size-4 shrink-0" />삭제하면 복구할 수 없어요</p>
          <div className="mt-2.5 flex gap-2">
            <button type="button" onClick={remove} disabled={pending} className="press inline-flex h-10 items-center rounded-full bg-danger px-4 text-sm font-black text-on-accent">삭제하기</button>
            <button type="button" onClick={() => setConfirmDelete(false)} disabled={pending} className="press inline-flex h-10 items-center rounded-full bg-surface px-4 text-sm font-bold shadow-sm">취소</button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          {item && <button type="button" aria-label="삭제" title="삭제" onClick={() => setConfirmDelete(true)} disabled={pending} className="press grid size-11 shrink-0 place-items-center rounded-full bg-danger-soft text-danger hover:brightness-95 disabled:opacity-50"><Trash2 className="size-5" /></button>}
          <span role="status" aria-live="polite" className="mr-auto inline-flex items-center gap-1.5 text-sm font-semibold text-ink-3">
            {pending ? <><LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" /><span className="sr-only">반영 중</span></>
              : dirty && item ? <><i aria-hidden="true" className="size-2 animate-pulse rounded-full bg-warn motion-reduce:animate-none" /><span className="sr-only">입력 중</span></>
              : savedLabel ? <><Check aria-hidden="true" className="size-4 text-ok" /><span className="sr-only">{savedLabel}</span></> : null}
          </span>
          {(!item || error) && <button type="button" aria-label={item ? "미반영 변경 취소" : "입력 취소"} onClick={onClose} disabled={pending} className="press inline-flex h-11 items-center rounded-full px-4 text-sm font-bold text-ink-2 hover:bg-surface-2">취소</button>}
          {item
            ? <button type="button" aria-label="완료" onClick={close} disabled={pending} className="press inline-flex h-11 items-center gap-1.5 rounded-full bg-accent px-5 text-sm font-black text-on-accent shadow-md hover:brightness-105 disabled:opacity-50"><Check aria-hidden="true" className="size-4" strokeWidth={3} />완료</button>
            : <button type="submit" aria-label="등록하기" disabled={pending} className="press inline-flex h-11 items-center gap-1.5 rounded-full bg-accent px-5 text-sm font-black text-on-accent shadow-md hover:brightness-105 disabled:opacity-50"><Check aria-hidden="true" className="size-4" strokeWidth={3} />저장</button>}
        </div>
      )}
    </form>
  </dialog>;
}
