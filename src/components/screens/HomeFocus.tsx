"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "@/components/PendingLink";
import { toggleTask } from "@/lib/actions/tasks";
import { completePlannerItem } from "@/lib/actions/planner";
import styles from "./Dashboard.module.css";

export type FocusTask = { id: string; title: string; context: string; due: string | null; href: string; version?: number };

export function HomeFocus({ items, today }: { items: FocusTask[]; today: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const router = useRouter();
  function complete(item: FocusTask) {
    startTransition(async () => {
      setError("");
      try {
        // 홈의 체크도 원본 액션을 사용해 본문·개인 할 일과 같은 상태를 보여 준다.
        if (item.version !== undefined) {
          const result = await completePlannerItem({ id: item.id, version: item.version }, true);
          if (!result.ok) { setError(result.error); return; }
        } else await toggleTask(item.id, true);
        router.refresh();
      } catch { setError("완료 상태를 반영하지 못했어요. 다시 시도해 주세요."); }
    });
  }
  return <div className={styles.focus}>
    <div className={styles.focusHeading}><h2>내 할 일 {items.length}개</h2><Link href="/tasks">전체 보기 →</Link></div>
    {items.length ? <ul>{items.map(item => <li key={item.id}>
      <input type="checkbox" checked={false} disabled={pending} onChange={() => complete(item)} aria-label={`${item.title} 완료`} />
      <Link href={item.href}><strong>{item.title}</strong><span>{item.context}</span></Link>
      {item.due && <small>{item.due < today ? "기한 지남" : item.due === today ? "오늘" : `${Number(item.due.slice(5, 7))}/${Number(item.due.slice(8))}`}</small>}
    </li>)}</ul> : <p className={styles.focusEmpty}>지금 챙길 일이 없어요.<br />새로운 할 일이 생기면 여기에 모아 드려요.</p>}
    {error && <p role="alert" className="mt-3 text-xs">{error}</p>}
  </div>;
}
