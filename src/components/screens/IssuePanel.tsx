"use client";

import { useActionState, useState } from "react";
import type { issues } from "@/lib/db/schema";
import { saveIssue } from "@/lib/actions/issues";
import { ISSUE_PRIORITIES, ISSUE_STATUSES } from "@/lib/issue-input";

type Issue = typeof issues.$inferSelect;
type Member = { id: string; name: string | null };
const input = "w-full min-w-0 rounded border border-line bg-surface px-3 py-2 text-sm text-ink";

function IssueForm({ spaceId, members, issue }: { spaceId: string; members: Member[]; issue?: Issue }) {
  const [state, action, pending] = useActionState(saveIssue, { ok: false, message: "" });
  return <form action={action} className="space-y-3">
    <input type="hidden" name="spaceId" value={spaceId} />
    {issue && <><input type="hidden" name="id" value={issue.id} /><input type="hidden" name="version" value={issue.version} /></>}
    <label className="block space-y-1 text-sm"><span>제목</span><input name="title" required maxLength={200} defaultValue={issue?.title} className={input} /></label>
    <label className="block space-y-1 text-sm"><span>내용</span><textarea name="body" rows={4} maxLength={10000} defaultValue={issue?.body} className={input} /></label>
    <div className="grid gap-3 sm:grid-cols-3">
      <label className="space-y-1 text-sm"><span>상태</span><select name="status" defaultValue={issue?.status === "raw" ? "open" : issue?.status ?? "open"} className={input}>{Object.entries(ISSUE_STATUSES).filter(([value]) => value !== "raw").map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="space-y-1 text-sm"><span>우선순위</span><select name="priority" defaultValue={issue?.priority ?? "normal"} className={input}>{Object.entries(ISSUE_PRIORITIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="space-y-1 text-sm"><span>담당자</span><select name="assigneeId" defaultValue={issue?.assigneeId ?? ""} className={input}><option value="">미지정</option>{members.map((member) => <option key={member.id} value={member.id}>{member.name ?? "이름 없음"}</option>)}</select></label>
    </div>
    {state.message && <p role={state.ok ? "status" : "alert"} className="text-sm text-ink-2">{state.message}</p>}
    <button disabled={pending} className="rounded bg-accent px-4 py-2 text-sm text-on-accent disabled:opacity-50">{pending ? "저장 중…" : issue?.status === "raw" ? "실제 이슈로 등록" : issue ? "이슈 수정" : "이슈 등록"}</button>
  </form>;
}

export function IssuePanel({ spaceId, members, rows }: { spaceId: string; members: Member[]; rows: Issue[] }) {
  const [creating, setCreating] = useState(false);
  return <section className="space-y-4" aria-label="프로젝트 이슈">
    <button type="button" aria-expanded={creating} onClick={() => setCreating(!creating)} className="rounded bg-accent px-4 py-2 text-sm text-on-accent">{creating ? "등록 닫기" : "+ 새 이슈"}</button>
    {creating && <div className="rounded border border-line p-4"><IssueForm spaceId={spaceId} members={members} /></div>}
    {rows.length === 0 && <p className="py-8 text-center text-sm text-ink-3">표시할 이슈가 없습니다.</p>}
    <ul className="space-y-3">{rows.map((issue) => <li key={issue.id} id={`issue-${issue.id}`} className="min-w-0 rounded border border-line p-4">
      <div className="flex flex-wrap gap-2 text-xs text-ink-3"><span>{ISSUE_STATUSES[issue.status]}</span><span>우선순위 {ISSUE_PRIORITIES[issue.priority]}</span><span>{members.find((m) => m.id === issue.assigneeId)?.name ?? "미지정"}</span></div>
      <h3 className="mt-2 break-words font-medium text-ink">{issue.title}</h3>
      {issue.body && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-ink-2">{issue.body}</p>}
      <details className="mt-3" key={issue.status}>
        <summary className="cursor-pointer text-sm text-accent">{issue.status === "raw" ? "실제 이슈로 가공하기" : "이슈 편집 · 원문 보기"}</summary>
        <div className="mt-4 grid gap-5 md:grid-cols-2" aria-label={issue.status === "raw" ? "미가공 이슈 가공 화면" : "이슈 편집 화면"}>
          <section className="rounded bg-surface-2 p-4">
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
