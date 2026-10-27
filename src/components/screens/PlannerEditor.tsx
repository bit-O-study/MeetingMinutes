"use client";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { deletePlannerItem, savePlannerItem } from "@/lib/actions/planner";
import { plannerInput, type PlannerInput, type PlannerItem } from "@/lib/planner";
import s from "./Planner.module.css";

export function PlannerEditor({ item, kind, date, onClose }: { item: PlannerItem | null; kind: "event" | "task"; date: string; onClose: () => void }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState<PlannerInput>(() => item ? { kind: item.kind, title: item.title, memo: item.memo, mode: item.mode, startDate: item.startDate, endDate: item.endDate, date: item.date, from: item.from, to: item.to, allDay: item.allDay } : { kind, title: "", memo: "", mode: kind === "event" ? "fixed" : "range", startDate: null, endDate: date, date, from: "14:00", to: "15:00", allDay: false });
  const identity = useRef({ id: item?.id || "", version: item?.version || 0 });
  const [saved, setSaved] = useState(() => JSON.stringify(form));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [savedLabel, setSavedLabel] = useState(item ? "자동 저장됨" : "");
  const [confirmDelete, setConfirmDelete] = useState(false);
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
  return <dialog ref={dialog} className={s.dialog} aria-labelledby="planner-editor-title" onCancel={event => { event.preventDefault(); close(); }}>
    <div className={s.dialogHead}><div><h2 id="planner-editor-title">{item ? "" : "새 "}{form.kind === "event" ? "개인 일정" : "할 일"}</h2><p>{item ? "변경한 내용은 자동으로 저장돼요." : "머릿속 계획을 하나씩 꺼내 보세요."}</p></div><button type="button" className={s.iconButton} onClick={close} disabled={pending} aria-label="닫기"><X /></button></div>
    <form className={s.form} onSubmit={event => { event.preventDefault(); persist(!item); }}>
      <fieldset disabled={pending}>
        <label className={s.field}>제목<input autoFocus value={form.title} maxLength={160} required onChange={e => change("title", e.target.value)} placeholder="어떤 일을 계획하고 있나요?" /></label>
        <label className={s.field}>메모 <span className="font-normal text-ink-3">선택</span><textarea value={form.memo} maxLength={4000} onChange={e => change("memo", e.target.value)} placeholder="기억해 둘 내용을 적어주세요." /></label>
        {form.kind === "task" && <><p className="text-xs font-bold">일정 방식</p><div className={s.modes}>{([['range', '기간 지정'], ['fixed', '일정 픽스'], ['none', '미정']] as const).map(([mode, title]) => <button key={mode} type="button" aria-pressed={form.mode === mode} className={form.mode === mode ? s.modeActive : ""} onClick={() => { setForm(current => ({ ...current, mode, endDate: current.endDate || date, date: current.date || date, from: current.from || "14:00", to: current.to || "15:00" })); setError(""); }}>{title}</button>)}</div></>}
        {form.mode === "range" && <div className={s.two}><label className={s.field}>시작일 <span className="font-normal text-ink-3">선택</span><input type="date" min="2000-01-01" max="2100-12-31" value={form.startDate || ""} onChange={e => change("startDate", empty(e.target.value))} /></label><label className={s.field}>마감일<input type="date" min="2000-01-01" max="2100-12-31" value={form.endDate || ""} required onChange={e => change("endDate", empty(e.target.value))} /></label></div>}
        {form.mode === "fixed" && <><label className={s.field}>날짜<input type="date" min="2000-01-01" max="2100-12-31" value={form.date || ""} required onChange={e => change("date", empty(e.target.value))} /></label><label className="mb-4 flex items-center gap-2 text-xs"><input type="checkbox" checked={form.allDay} onChange={e => change("allDay", e.target.checked)} />종일</label>{!form.allDay && <div className={s.two}><label className={s.field}>시작 시간<input type="time" value={form.from || ""} required onChange={e => change("from", empty(e.target.value))} /></label><label className={s.field}>종료 시간<input type="time" value={form.to || ""} required onChange={e => change("to", empty(e.target.value))} /></label></div>}</>}
      </fieldset>
      <p className={s.formNote}>{form.mode === "range" ? "시작일 없이 마감일만 정해도 괜찮아요." : form.mode === "fixed" ? "이 시간에 집중할 수 있도록 달력에 표시해요." : "날짜는 나중에 정해도 괜찮아요. 할 일 목록에 담아둘게요."}</p>
      <p role="status" className={s.saveState}>{pending ? "반영 중…" : dirty && item ? "입력 중…" : savedLabel}</p>
      {error && <div role="alert" className={s.error}>{error}{item && <button type="button" className="ml-2 underline" onClick={() => persist()} disabled={pending}>다시 시도</button>}</div>}
      {confirmDelete ? <div className="rounded-xl bg-danger-soft p-3 text-xs"><p>이 항목을 삭제할까요? 삭제하면 복구할 수 없어요.</p><div className="mt-3 flex justify-end gap-4"><button type="button" onClick={() => setConfirmDelete(false)} disabled={pending}>취소</button><button type="button" onClick={remove} disabled={pending} className="font-bold text-danger">삭제하기</button></div></div> : <div className={s.formActions}>{item && <button type="button" className={s.dangerButton} onClick={() => setConfirmDelete(true)} disabled={pending}>삭제</button>}{(!item || error) && <button type="button" className={s.discard} onClick={onClose} disabled={pending}>{item ? "미반영 변경 취소" : "입력 취소"}</button>}{item ? <button type="button" className={s.primary} onClick={close} disabled={pending}>닫기</button> : <button type="submit" className={s.primary} disabled={pending}>등록하기</button>}</div>}
    </form>
  </dialog>;
}
