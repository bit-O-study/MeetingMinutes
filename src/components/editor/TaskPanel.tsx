"use client";

import { useTransition } from "react";
import { Plus } from "lucide-react";

import { DueBadge } from "@/components/ui/Badge";
import type { Task } from "@/lib/db/schema";
import { isOverdue, todayInSeoul } from "@/lib/utils";

/**
 * 우측 보조 패널. 2차에 댓글, 3차에 전사 타임라인이 같은 자리에 들어간다.
 *
 * 여기 항목과 본문 체크박스는 같은 tasks 레코드다(blockId가 연결 고리).
 * 상태는 NoteWorkspace가 한 곳에서 들고 있고, 이 컴포넌트는 그리기만 한다.
 */
export function TaskPanel({
  tasks,
  onToggle,
  onAdd,
}: {
  tasks: Task[];
  onToggle: (task: Task) => Promise<void> | void;
  onAdd: () => void;
}) {
  const today = todayInSeoul();
  const [pending, startTransition] = useTransition();

  const open = tasks.filter((t) => !t.doneAt);
  const done = tasks.filter((t) => t.doneAt);

  return (
    <aside className="flex w-full flex-none flex-col gap-3 border-t border-line bg-surface px-4 py-4 lg:w-72 lg:border-t-0 lg:border-l">
      <div className="flex items-center gap-2">
        <h2 className="font-mono text-[10px] font-semibold uppercase tracking-[0.09em] text-accent">
          할 일 {tasks.length}
        </h2>
        {/* 2차: 댓글 탭이 여기 붙는다 */}
      </div>

      <Group label={`미완료 ${open.length}`}>
        {open.map((task) => (
          <Row
            key={task.id}
            task={task}
            today={today}
            disabled={pending}
            onToggle={() => startTransition(() => void onToggle(task))}
          />
        ))}
        {open.length === 0 && (
          <p className="text-xs leading-relaxed text-ink-3">
            남은 할 일이 없습니다.
          </p>
        )}
      </Group>

      {done.length > 0 && (
        <Group label={`완료 ${done.length}`}>
          {done.map((task) => (
            <Row
              key={task.id}
              task={task}
              today={today}
              disabled={pending}
              onToggle={() => startTransition(() => void onToggle(task))}
            />
          ))}
        </Group>
      )}

      <button
        type="button"
        onClick={onAdd}
        className="flex items-center justify-center gap-1.5 rounded border border-dashed border-line px-2 py-1.5 text-xs text-accent transition-colors hover:bg-accent-soft"
      >
        <Plus className="size-3" />할 일
      </button>

      {/*
        추가 버튼은 본문 끝에 체크박스를 넣고 커서를 옮긴다.
        할 일의 존재는 본문이 정하므로, 패널에만 있는 항목을 만들지 않는다.
        내용을 적어야 목록에 나타난다 — 빈 항목은 아직 할 일이 아니다.
      */}
      <p className="text-[11px] leading-relaxed text-ink-3">
        본문에 적은 체크박스가 여기 모입니다.
      </p>

      {/* TODO(CLAUDE): 담당자(@) · 기한 지정 UI */}
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
  disabled,
  onToggle,
}: {
  task: Task;
  today: string;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2 py-0.5">
      <input
        type="checkbox"
        checked={Boolean(task.doneAt)}
        disabled={disabled}
        onChange={onToggle}
        className="mt-1 size-3.5 flex-none accent-[var(--accent)]"
      />
      <span className="min-w-0 flex-1">
        <span
          className={`block text-[13px] leading-snug ${
            task.doneAt ? "text-ink-3 line-through" : "text-ink"
          }`}
        >
          {task.body}
        </span>
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
