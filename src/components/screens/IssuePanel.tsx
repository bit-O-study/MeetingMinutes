"use client";

import { useActionState, useState } from "react";
import type { issues } from "@/lib/db/schema";
import { saveIssue } from "@/lib/actions/issues";
import { ISSUE_PRIORITIES, ISSUE_STATUSES } from "@/lib/issue-input";

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
    <div className="grid gap-3 sm:grid-cols-3">
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
  return <section className="space-y-4" aria-label="프로젝트 이슈">
    <button type="button" aria-expanded={creating} onClick={() => setCreating(!creating)} className="press inline-flex h-11 items-center justify-center gap-1.5 rounded-2xl bg-accent px-5 text-sm font-bold text-on-accent shadow-sm hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45">{creating ? "등록 닫기" : "+ 새 이슈"}</button>
    {creating && <div className="rounded-2xl bg-surface p-4"><IssueForm spaceId={spaceId} members={members} /></div>}
    {rows.length === 0 && <p className="rounded-2xl bg-surface py-10 text-center text-sm text-ink-3">표시할 이슈가 없어요.</p>}
    <ul className="space-y-3">{rows.map((issue) => <li key={issue.id} id={`issue-${issue.id}`} className={`min-w-0 rounded-2xl bg-surface p-4 shadow-[inset_4px_0_0_var(--stripe)] ${STRIPE[issue.status === "raw" ? "raw" : issue.priority]}`}>
      {/* 우선순위는 왼쪽 색 띠와 칩으로, 상태·담당은 칩으로(재디자인 — 예전엔 회색 글자 한 줄). */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`inline-flex h-6 items-center rounded-full px-2.5 text-xs font-bold ${STATUS_CHIP[issue.status]}`}>{ISSUE_STATUSES[issue.status]}</span>
        {issue.status !== "raw" && <span className={`inline-flex h-6 items-center rounded-full px-2.5 text-xs font-bold ${PRIORITY_CHIP[issue.priority]}`}>{ISSUE_PRIORITIES[issue.priority]}</span>}
        <span className="text-xs text-ink-3">{members.find((m) => m.id === issue.assigneeId)?.name ?? "담당 없음"}</span>
      </div>
      <h3 className="mt-2 break-words text-[15px] font-extrabold text-ink">{issue.title}</h3>
      {issue.body && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-ink-2">{issue.body}</p>}
      <details className="mt-3" key={issue.status}>
        <summary className="inline-flex cursor-pointer items-center rounded-xl bg-accent-soft px-3 py-2 text-sm font-bold text-accent">{issue.status === "raw" ? "실제 이슈로 가공하기" : "이슈 편집 · 원문 보기"}</summary>
        <div className="mt-4 grid gap-5 md:grid-cols-2" aria-label={issue.status === "raw" ? "미가공 이슈 가공 화면" : "이슈 편집 화면"}>
          <section className="rounded-2xl bg-surface-2 p-4">
            <h4 className="font-medium text-ink">채팅 원문</h4>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm text-ink-2">{issue.originalBody ?? (issue.status === "raw" ? issue.body : "연결된 채팅 원문이 없습니다.")}</p>
            <p className="mt-3 text-xs text-ink-3">오른쪽에서 내용을 정리해도 원문은 유지됩니다.</p>
          </section>
          <section><h4 className="mb-3 font-medium text-ink">{issue.status === "raw" ? "실제 이슈 작성" : "이슈 수정"}</h4><IssueForm key={issue.version} spaceId={spaceId} members={members} issue={issue} /></section>
        </div>
      </details>
    </li>)}</ul>
  </section>;
}
