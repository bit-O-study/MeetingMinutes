"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ActionSubmit } from "@/components/screens/ActionSubmit";

export function CreateSpaceForm({ action }: {
  action: (state: { error: string }, data: FormData) => Promise<{ error: string }>;
}) {
  const [state, formAction] = useActionState(action, { error: "" });
  return <form action={formAction} className="space-y-5 p-5">
    <div>
      <label htmlFor="space-name" className="mb-2 block text-sm font-medium text-ink">스페이스 이름</label>
      <input id="space-name" name="name" required maxLength={120} placeholder="예: 프론트엔드 스터디"
        className="w-full rounded border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none" />
    </div>
    <fieldset className="space-y-2">
      <legend className="mb-2 text-sm font-medium text-ink">용도</legend>
      {[
        { value: "study", label: "스터디", hint: "함께 배운 내용과 막힌 질문, 다음 회차를 기록합니다." },
        { value: "handover", label: "인수인계", hint: "업무 절차와 주의사항, 미완료 건을 함께 정리합니다." },
        { value: "general", label: "일반", hint: "회의 메모와 자유로운 기록을 함께 작성합니다." },
      ].map((kind) => <label key={kind.value} className="flex cursor-pointer items-start gap-3 rounded border border-line p-3 hover:bg-surface-2">
        <input type="radio" name="kind" value={kind.value} defaultChecked={kind.value === "study"} required className="mt-1 accent-accent" />
        <span><span className="block text-sm font-medium text-ink">{kind.label}</span><span className="mt-1 block text-xs text-ink-3">{kind.hint}</span></span>
      </label>)}
    </fieldset>
    <p className="text-xs leading-relaxed text-ink-3">만든 사람이 소유자가 됩니다. 생성 후 멤버 탭에서 초대 링크를 만들 수 있으며, 참여한 멤버는 모든 노트를 함께 편집합니다.</p>
    {state.error && <p role="alert" className="text-sm text-warn">{state.error}</p>}
    <div className="flex items-center gap-4"><ActionSubmit>스페이스 만들기</ActionSubmit><Link href="/" className="text-sm text-ink-2 hover:text-accent">취소</Link></div>
  </form>;
}
