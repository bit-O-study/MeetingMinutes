"use client";

import Link from "@/components/PendingLink";
import { useActionState } from "react";
import { ActionSubmit } from "@/components/screens/ActionSubmit";
import styles from "./Form.module.css";

export function CreateSpaceForm({ action }: {
  action: (state: { error: string }, data: FormData) => Promise<{ error: string }>;
}) {
  const [state, formAction] = useActionState(action, { error: "" });
  return <form action={formAction} className={styles.form}>
    <div>
      <label htmlFor="space-name" className={styles.label}>프로젝트 이름</label>
      <input id="space-name" name="name" required maxLength={120} placeholder="예: 프론트엔드 스터디"
        className={styles.input} />
    </div>
    <fieldset className={styles.choices}>
      <legend className={styles.label}>용도</legend>
      {[
        { value: "study", label: "스터디", hint: "함께 배운 내용과 막힌 질문, 다음 회차를 기록합니다." },
        { value: "handover", label: "인수인계", hint: "업무 절차와 주의사항, 미완료 건을 함께 정리합니다." },
        { value: "general", label: "일반", hint: "회의 메모와 자유로운 기록을 함께 작성합니다." },
      ].map((kind) => <label key={kind.value} className={styles.choice}>
        <input type="radio" name="kind" value={kind.value} defaultChecked={kind.value === "study"} required className="mt-1 accent-accent" />
        <span><strong>{kind.label}</strong><small>{kind.hint}</small></span>
      </label>)}
    </fieldset>
    <p className={styles.hint}>만든 뒤 멤버를 초대할 수 있습니다. 참여한 멤버는 모든 노트를 함께 편집합니다.</p>
    {state.error && <p role="alert" className="text-sm text-warn">{state.error}</p>}
    <div className={styles.actions}><ActionSubmit>프로젝트 만들기</ActionSubmit><Link href="/projects" className={styles.cancel}>취소</Link></div>
  </form>;
}
