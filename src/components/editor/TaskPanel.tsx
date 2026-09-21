"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";

import { DueBadge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import type { Task } from "@/lib/db/schema";
import { isOverdue, todayInSeoul } from "@/lib/utils";

export type Member = { id: string; name: string | null; image: string | null };

export type TaskPatch = { assigneeId?: string | null; dueDate?: string | null };

/**
 * 우측 보조 패널. 2차에 댓글, 3차에 전사 타임라인이 같은 자리에 들어간다.
 *
 * 여기 항목과 본문 체크박스는 같은 tasks 레코드다(blockId가 연결 고리).
 * 상태는 NoteWorkspace가 한 곳에서 들고 있고, 이 컴포넌트는 그리기만 한다.
 */
export function TaskPanel({
  tasks,
  members,
  onToggle,
  onUpdate,
  onDelete,
  onAdd,
}: {
  tasks: Task[];
  members: Member[];
  onToggle: (task: Task) => Promise<void> | void;
  onUpdate: (taskId: string, patch: TaskPatch) => Promise<void> | void;
  onDelete: (taskId: string) => Promise<void> | void;
  onAdd: () => void;
}) {
  const today = todayInSeoul();
  const [pending, startTransition] = useTransition();
  const [openId, setOpenId] = useState<string | null>(null);

  const open = tasks.filter((t) => !t.doneAt);
  const done = tasks.filter((t) => t.doneAt);

  const row = (task: Task) => (
    <Row
      key={task.id}
      task={task}
      members={members}
      today={today}
      disabled={pending}
      expanded={openId === task.id}
      onExpand={() => setOpenId((id) => (id === task.id ? null : task.id))}
      onToggle={() => startTransition(() => void onToggle(task))}
      onUpdate={(patch) => startTransition(() => void onUpdate(task.id, patch))}
      onDelete={() => {
        setOpenId(null);
        startTransition(() => void onDelete(task.id));
      }}
    />
  );

  return (
    <aside className="flex w-full flex-none flex-col gap-3 border-t border-line bg-surface px-4 py-4 lg:w-72 lg:border-t-0 lg:border-l">
      <h2 className="font-mono text-[10px] font-semibold uppercase tracking-[0.09em] text-accent">
        할 일 {tasks.length}
      </h2>

      <Group label={`미완료 ${open.length}`}>
        {open.map(row)}
        {open.length === 0 && (
          <p className="text-xs leading-relaxed text-ink-3">남은 할 일이 없습니다.</p>
        )}
      </Group>

      {done.length > 0 && <Group label={`완료 ${done.length}`}>{done.map(row)}</Group>}

      <button
        type="button"
        onClick={onAdd}
        className="flex items-center justify-center gap-1.5 rounded border border-dashed border-line px-2 py-1.5 text-xs text-accent transition-colors hover:bg-accent-soft"
      >
        <Plus className="size-3" />할 일
      </button>

      <p className="text-[11px] leading-relaxed text-ink-3">
        본문에 적은 체크박스가 여기 모입니다. 항목을 누르면 담당자와 기한을 정할 수 있습니다.
      </p>
    </aside>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1">
      <h3 className="font-mono text-[10px] uppercase tracking-[0.07em] text-ink-3">{label}</h3>
      {children}
    </section>
  );
}

function Row({
  task,
  members,
  today,
  disabled,
  expanded,
  onExpand,
  onToggle,
  onUpdate,
  onDelete,
}: {
  task: Task;
  members: Member[];
  today: string;
  disabled: boolean;
  expanded: boolean;
  onExpand: () => void;
  onToggle: () => void;
  onUpdate: (patch: TaskPatch) => void;
  onDelete: () => void;
}) {
  const assignee = members.find((m) => m.id === task.assigneeId);
  const doneClass = task.doneAt ? "text-ink-3 line-through" : "text-ink";

  return (
    <div className={`rounded ${expanded ? "bg-surface-2" : ""}`}>
      <div className="flex items-start gap-2 px-1 py-1">
        <input
          type="checkbox"
          checked={Boolean(task.doneAt)}
          disabled={disabled}
          onChange={onToggle}
          aria-label={`${task.body} 완료`}
          className="mt-1 size-3.5 flex-none accent-[var(--accent)]"
        />

        <button
          type="button"
          onClick={onExpand}
          aria-expanded={expanded}
          className="min-w-0 flex-1 text-left"
        >
          <span className={`block text-[13px] leading-snug ${doneClass}`}>{task.body}</span>

          <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
            {assignee ? (
              <span className="inline-flex items-center gap-1 text-[10px] text-ink-2">
                <Avatar name={assignee.name} image={assignee.image} seed={assignee.id} size={13} />
                {assignee.name}
              </span>
            ) : (
              // 담당자 없음은 빠뜨린 게 아니라 "다 같이 한다"는 뜻이다.
              <span className="font-mono text-[10px] text-ink-3">공용</span>
            )}
            <DueBadge
              dueDate={task.dueDate}
              overdue={isOverdue(task.dueDate, task.doneAt)}
              today={today}
            />
          </span>
        </button>
      </div>

      {expanded && (
        <div className="flex flex-col gap-2 px-1 pb-2">
          <label className="flex flex-col gap-0.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.07em] text-ink-3">
              담당자
            </span>
            <select
              value={task.assigneeId ?? ""}
              disabled={disabled}
              onChange={(e) => onUpdate({ assigneeId: e.target.value || null })}
              className="rounded border border-line bg-surface px-2 py-1 text-xs text-ink outline-none focus:border-accent"
            >
              <option value="">공용 (전원)</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name ?? "이름 없음"}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-0.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.07em] text-ink-3">
              기한
            </span>
            <input
              type="date"
              value={task.dueDate ?? ""}
              disabled={disabled}
              onChange={(e) => onUpdate({ dueDate: e.target.value || null })}
              className="rounded border border-line bg-surface px-2 py-1 text-xs text-ink outline-none focus:border-accent"
            />
          </label>

          {/*
            본문 체크박스와 이어진 항목은 지워도 다음 동기화 때 되살아난다.
            존재는 본문이 정하기 때문이다. 그래서 삭제를 아예 보여 주지 않고
            본문에서 지우라고 안내한다.
          */}
          {task.blockId ? (
            <p className="text-[10px] leading-relaxed text-ink-3">
              본문 체크박스와 이어져 있습니다. 지우려면 본문에서 지우세요.
            </p>
          ) : (
            <button
              type="button"
              disabled={disabled}
              onClick={onDelete}
              className="flex items-center gap-1 self-start rounded border border-line px-2 py-1 font-mono text-[10px] text-accent transition-colors hover:bg-accent-soft disabled:opacity-40"
            >
              <Trash2 className="size-3" />
              지우기
            </button>
          )}
        </div>
      )}
    </div>
  );
}
