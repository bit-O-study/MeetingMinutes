"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import type { issues } from "@/lib/db/schema";
import { resolveRawIssue, saveIssue } from "@/lib/actions/issues";
import { ISSUE_PRIORITIES, ISSUE_STATUSES } from "@/lib/issue-labels";
import styles from "./Issues.module.css";

type Issue = typeof issues.$inferSelect;
// 색 띠·칩 — 클래스 이름은 Tailwind 가 찾을 수 있게 글자 그대로 적는다.
const STRIPE = { raw: "[--stripe:var(--warn)]", high: "[--stripe:var(--danger)]", normal: "[--stripe:var(--accent)]", low: "[--stripe:var(--line-2)]" } as const;
const STATUS_CHIP = { raw: "bg-warn-soft text-warn", open: "bg-surface-2 text-ink-2", in_progress: "bg-accent-soft text-accent", closed: "bg-ok-soft text-ok" } as const;
const PRIORITY_CHIP = { high: "bg-danger-soft text-danger", normal: "bg-surface-2 text-ink-2", low: "bg-surface-2 text-ink-3" } as const;
type Member = { id: string; name: string | null };
// 재디자인: 테두리 칸 대신 안쪽 선 + 둥근 칸(공용 fieldClass 와 같은 모양). textarea 는 높이를 따로 준다.
const input = "h-11 w-full min-w-0 rounded-2xl bg-surface px-3.5 text-[15px] text-ink ring-1 ring-inset ring-line placeholder:text-ink-3 focus:ring-2 focus:ring-accent focus:outline-none";

function IssueForm({ spaceId, members, issue }: { spaceId: string; members: Member[]; issue?: Issue }) {
  const [state, action, pending] = useActionState(saveIssue, { ok: false, message: "" });
  return <form action={action} className="space-y-3">
    <input type="hidden" name="spaceId" value={spaceId} />
    {issue && <><input type="hidden" name="id" value={issue.id} /><input type="hidden" name="version" value={issue.version} /></>}
    <label className="block space-y-1 text-sm"><span>제목</span><input name="title" required maxLength={200} defaultValue={issue?.title} className={input} /></label>
    <label className="block space-y-1 text-sm"><span>내용</span><textarea name="body" rows={4} maxLength={10000} defaultValue={issue?.body} className={input + " h-auto py-3"} /></label>
    <div className="grid gap-3">
      <label className="space-y-1 text-sm"><span>상태</span><select name="status" defaultValue={issue?.status === "raw" ? "open" : issue?.status ?? "open"} className={input}>{Object.entries(ISSUE_STATUSES).filter(([value]) => value !== "raw").map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="space-y-1 text-sm"><span>우선순위</span><select name="priority" defaultValue={issue?.priority ?? "normal"} className={input}>{Object.entries(ISSUE_PRIORITIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="space-y-1 text-sm"><span>담당자</span><select name="assigneeId" defaultValue={issue?.assigneeId ?? ""} className={input}><option value="">미지정</option>{members.map((member) => <option key={member.id} value={member.id}>{member.name ?? "이름 없음"}</option>)}</select></label>
    </div>
    {state.message && <p role={state.ok ? "status" : "alert"} className="text-sm text-ink-2">{state.message}</p>}
    <button disabled={pending} className="press inline-flex h-11 items-center justify-center gap-1.5 rounded-2xl bg-accent px-5 text-sm font-bold text-on-accent shadow-sm hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45">{pending ? "저장 중…" : issue?.status === "raw" ? "실제 이슈로 등록" : issue ? "이슈 수정" : "이슈 등록"}</button>
  </form>;
}

export function IssuePanel({ spaceId, members, rows }: { spaceId: string; members: Member[]; rows: Issue[] }) {
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  // 좁은 화면의 패널은 목록 위에 있으므로 선택한 뒤 실제 편집 위치로 이동한다.
  useEffect(() => {
    if ((selectedId || creating) && window.matchMedia("(max-width: 767px)").matches) {
      panelRef.current?.scrollIntoView({ block: "start" });
      panelRef.current?.focus({ preventScroll: true });
    }
  }, [selectedId, creating]);
  useEffect(() => {
    const selectLinked = () => {
      const id = new URLSearchParams(window.location.search).get("issue") ?? window.location.hash.replace(/^#issue-/, "");
      if (rows.some(issue => issue.id === id)) setSelectedId(id);
    };
    selectLinked();
    window.addEventListener("hashchange", selectLinked);
    return () => window.removeEventListener("hashchange", selectLinked);
  }, [rows]);
  const selected = rows.find(issue => issue.id === selectedId);
  return <section className={styles.root} aria-label="프로젝트 이슈">
    <button type="button" aria-expanded={creating} onClick={() => { setCreating(!creating); setSelectedId(null); }} className={styles.create}>{creating ? "등록 닫기" : "+ 새 이슈"}</button>
    <ul className={styles.list}>{rows.map(issue => <li key={issue.id} id={`issue-${issue.id}`} className={`${styles.row} ${STRIPE[issue.status === "raw" ? "raw" : issue.priority]}`}>
      <button type="button" aria-pressed={selectedId === issue.id} aria-controls="issue-detail" className={selectedId === issue.id ? styles.selected : ""} onClick={() => { setCreating(false); setSelectedId(issue.id); }}>
        <span className={styles.title}>{issue.title}</span>
        {issue.body && <span className="mt-2 block line-clamp-2 whitespace-pre-wrap break-words text-xs leading-6 text-ink-2">{issue.body}</span>}
        <span className={styles.meta}>
          <span className={`rounded-full px-2 py-1 ${STATUS_CHIP[issue.status]}`}>{ISSUE_STATUSES[issue.status]}</span>
          {issue.status !== "raw" && <span className={`rounded-full px-2 py-1 ${PRIORITY_CHIP[issue.priority]}`}>우선순위 {ISSUE_PRIORITIES[issue.priority]}</span>}
          <span>{members.find(member => member.id === issue.assigneeId)?.name ?? "담당 없음"}</span>
        </span>
      </button>
    </li>)}{!rows.length && <li className={styles.empty}>표시할 이슈가 없어요.</li>}</ul>
    <aside ref={panelRef} tabIndex={-1} id="issue-detail" className={styles.panel} aria-label="이슈 편집 · 원문 보기">
      <div className={styles.panelHead}><h2>{creating ? "새 이슈" : "이슈 편집 · 원문 보기"}</h2>{(selected || creating) && <button type="button" onClick={() => { setSelectedId(null); setCreating(false); }}>닫기</button>}</div>
      {creating ? <IssueForm spaceId={spaceId} members={members} /> : selected ? <>
        <section className={styles.source}><h3>채팅 원문</h3><p>{selected.originalBody ?? (selected.status === "raw" ? selected.body : "연결된 채팅 원문이 없습니다.")}</p></section>
        <IssueForm key={`${selected.id}:${selected.version}`} spaceId={spaceId} members={members} issue={selected} />
        {selected.status === "raw" && <RawIssueActions key={selected.version} spaceId={spaceId} issue={selected} />}
        <p className="mt-5 text-xs leading-6 text-ink-3">내용을 정리해도 채팅 원문은 그대로 유지됩니다.</p>
      </> : <p className={styles.empty}>목록에서 이슈를 선택하면<br />원문을 보고 내용을 정리할 수 있어요.</p>}
    </aside>
  </section>;
}

function RawIssueActions({ spaceId, issue }: { spaceId: string; issue: Issue }) {
  const [state, action, pending] = useActionState(resolveRawIssue, { ok: false, message: "" });
  return <form action={action} className="mt-3 space-y-2">
    <input type="hidden" name="spaceId" value={spaceId} /><input type="hidden" name="id" value={issue.id} /><input type="hidden" name="version" value={issue.version} />
    <div className="flex gap-2"><button name="operation" value="complete" disabled={pending} className="rounded-xl bg-ok-soft px-3 py-2 text-sm font-bold text-ok disabled:opacity-45">{pending ? "처리 중…" : "완료 처리"}</button>
    <button name="operation" value="delete" disabled={pending} onClick={event => { if (!window.confirm("미가공 이슈를 삭제할까요? 채팅 원문은 유지됩니다.")) event.preventDefault(); }} className="rounded-xl bg-danger-soft px-3 py-2 text-sm font-bold text-danger disabled:opacity-45">삭제</button></div>
    {state.message && <p role={state.ok ? "status" : "alert"} className="text-sm text-ink-2">{state.message}</p>}
  </form>;
}
