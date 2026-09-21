"use client";

import Link from "next/link";
import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DueBadge } from "@/components/ui/Badge";
import { toggleTask } from "@/lib/actions/tasks";
import { cn } from "@/lib/utils";

export type TaskRowData = {
  id: string;
  body: string;
  noteId: string;
  spaceId: string;
  noteTitle: string;
  spaceName?: string;
  dueDate: string | null;
  done: boolean;
  overdue: boolean;
};

export function TaskRow({ task, today }: { task: TaskRowData; today: string }) {
  const router = useRouter();
  const errorId = useId();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);

  function toggle() {
    setError(false);
    startTransition(async () => {
      try {
        await toggleTask(task.id);
        // 홈과 스페이스에서도 같은 레코드를 다시 읽어 완료 항목을 맞춘다.
        router.refresh();
      } catch {
        setError(true);
      }
    });
  }

  return (
    <li className="flex items-start gap-2 px-3 py-2" aria-busy={pending}>
      <label className="flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center">
        <input type="checkbox" checked={task.done} disabled={pending} onChange={toggle}
          aria-label={task.body + (task.done ? " 완료 취소" : " 완료")}
          aria-describedby={error ? errorId : undefined}
          className="size-4 accent-accent focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent disabled:cursor-wait" />
      </label>
      <div className="min-w-0 flex-1 py-2">
        <p className={cn("break-words text-sm text-ink", task.done && "text-ink-3 line-through")}>{task.body}</p>
        <Link href={"/s/" + task.spaceId + "/n/" + task.noteId}
          className="mt-1 block break-words text-xs text-ink-3 hover:text-accent focus-visible:outline-2 focus-visible:outline-accent">
          {task.spaceName && task.spaceName + " · "}{task.noteTitle}
        </Link>
        {pending && <p role="status" className="mt-1 text-xs text-ink-3">반영 중…</p>}
        {error && <p id={errorId} role="alert" className="mt-1 text-xs text-accent">변경하지 못했습니다. 다시 체크해 주세요.</p>}
      </div>
      <div className="shrink-0 pt-2.5">
        <DueBadge dueDate={task.dueDate} overdue={task.overdue} today={today} />
      </div>
    </li>
  );
}
