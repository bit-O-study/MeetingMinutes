"use client";

import { useOptimistic, useTransition } from "react";

import { toggleTask } from "@/lib/actions/tasks";
import { DueBadge } from "@/components/ui/Badge";
import type { Task } from "@/lib/db/schema";
import { isOverdue, todayInSeoul } from "@/lib/utils";

/**
 * 우측 보조 패널. 2차에 댓글, 3차에 전사 타임라인이 같은 자리에 들어간다.
 *
 * 여기 항목과 본문 체크박스는 같은 레코드다 (tasks.blockId가 연결 고리).
 * 두 벌로 관리하면 반드시 어긋난다.
 */
export function TaskPanel({
  noteId,
  initialTasks,
}: {
  noteId: string;
  initialTasks: Task[];
}) {
  const today = todayInSeoul();
  const [, startTransition] = useTransition();
  const [items, setDone] = useOptimistic(initialTasks, (state: Task[], id: string) =>
    state.map((t) => (t.id === id ? { ...t, doneAt: t.doneAt ? null : new Date() } : t)),
  );

  const open = items.filter((t) => !t.doneAt);
  const done = items.filter((t) => t.doneAt);

  return (
    <aside className="flex w-full flex-none flex-col gap-3 border-t border-line bg-surface px-4 py-4 lg:w-72 lg:border-t-0 lg:border-l">
      <div className="flex items-center gap-2">
        <h2 className="font-mono text-[10px] font-semibold uppercase tracking-[0.09em] text-accent">
          할 일 {items.length}
        </h2>
        {/* 2차: 댓글 탭이 여기 붙는다 */}
      </div>

      <Group label={`미완료 ${open.length}`}>
        {open.map((task) => (
          <Row
            key={task.id}
            task={task}
            today={today}
            onToggle={() =>
              startTransition(async () => {
                setDone(task.id);
                await toggleTask(task.id);
              })
            }
          />
        ))}
        {open.length === 0 && <p className="text-xs text-ink-3">남은 할 일이 없습니다.</p>}
      </Group>

      {done.length > 0 && (
        <Group label={`완료 ${done.length}`}>
          {done.map((task) => (
            <Row
              key={task.id}
              task={task}
              today={today}
              onToggle={() =>
                startTransition(async () => {
                  setDone(task.id);
                  await toggleTask(task.id);
                })
              }
            />
          ))}
        </Group>
      )}

      {/* TODO(CLAUDE): + 할 일 추가 · 담당자(@) · 기한 지정 · 본문 체크박스 양방향 동기화 */}
      <p className="font-mono text-[10px] text-ink-3">노트 {noteId.slice(0, 8)}</p>
    </aside>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="font-mono text-[10px] uppercase tracking-[0.07em] text-ink-3">{label}</h3>
      {children}
    </section>
  );
}

function Row({
  task,
  today,
  onToggle,
}: {
  task: Task;
  today: string;
  onToggle: () => void;
}) {
  const doneClass = task.doneAt ? "text-ink-3 line-through" : "text-ink";

  return (
    <label className="flex cursor-pointer items-start gap-2 py-0.5">
      <input
        type="checkbox"
        checked={Boolean(task.doneAt)}
        onChange={onToggle}
        className="mt-1 size-3.5 flex-none accent-[var(--accent)]"
      />
      <span className="min-w-0 flex-1">
        <span className={`block text-[13px] leading-snug ${doneClass}`}>{task.body}</span>
        <span className="mt-0.5 flex items-center gap-1.5">
          <DueBadge
            dueDate={task.dueDate}
            overdue={isOverdue(task.dueDate, task.doneAt)}
            today={today}
          />
        </span>
      </span>
    </label>
  );
}
