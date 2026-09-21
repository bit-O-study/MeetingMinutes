"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { MoreHorizontal, Trash2 } from "lucide-react";

import { renameNote, setNoteStatus, trashNote } from "@/lib/actions/notes";
import { NoteStatusBadge } from "@/components/ui/Badge";
import type { NoteStatus } from "@/lib/db/schema";

export function NoteHeader({
  noteId,
  spaceId,
  spaceName,
  title: initialTitle,
  status: initialStatus,
  updatedLabel,
  taskCount,
}: {
  noteId: string;
  spaceId: string;
  spaceName: string;
  title: string;
  status: NoteStatus;
  /** 서버에서 만든 문구를 그대로 받는다. 클라이언트에서 다시 계산하면 첫 렌더가 어긋난다. */
  updatedLabel: string;
  taskCount: number;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [status, setStatus] = useState(initialStatus);
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const menuRef = useRef<HTMLDetailsElement>(null);

  function commitTitle(next: string) {
    const trimmed = next.trim();
    setEditing(false);
    if (!trimmed || trimmed === title) return;
    setTitle(trimmed);
    startTransition(() => void renameNote(noteId, trimmed));
  }

  /**
   * 작성 중 ↔ 정리됨.
   * 잠금이 아니라 목록에서 구분하기 위한 표시다. 누구나 바꾸고 되돌릴 수 있으므로
   * 확인을 묻지 않는다.
   */
  function toggleStatus() {
    const next: NoteStatus = status === "tidied" ? "draft" : "tidied";
    setStatus(next);
    startTransition(() => void setNoteStatus(noteId, next));
  }

  return (
    <header className="flex flex-none flex-wrap items-center gap-2 border-b border-line bg-surface px-4 py-2">
      <Link
        href={`/s/${spaceId}`}
        className="font-mono text-[11px] text-ink-3 transition-colors hover:text-accent"
      >
        ← {spaceName}
      </Link>

      {editing ? (
        <input
          autoFocus
          defaultValue={title}
          disabled={pending}
          aria-label="노트 제목"
          onBlur={(e) => commitTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            // Esc는 되돌린다. 실수로 지웠을 때 빠져나갈 길이 있어야 한다.
            if (e.key === "Escape") {
              e.currentTarget.value = title;
              e.currentTarget.blur();
            }
          }}
          className="min-w-0 flex-1 rounded border border-accent bg-surface px-1.5 py-0.5 font-serif text-base font-semibold text-ink outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          title="클릭해서 제목 수정"
          className="min-w-0 truncate rounded px-1 font-serif text-base font-semibold text-ink transition-colors hover:bg-surface-2"
        >
          {title}
        </button>
      )}

      <button type="button" onClick={toggleStatus} disabled={pending} title="상태 바꾸기">
        <NoteStatusBadge status={status} />
      </button>

      <span className="ml-auto font-mono text-[10px] text-ink-3">{updatedLabel}</span>

      {/* details를 쓰면 바깥 클릭으로 닫히는 동작과 키보드 접근을 브라우저가 처리한다. */}
      <details ref={menuRef} className="relative">
        <summary
          aria-label="노트 메뉴"
          className="flex cursor-pointer list-none items-center rounded p-1 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink [&::-webkit-details-marker]:hidden"
        >
          <MoreHorizontal className="size-4" />
        </summary>

        <div className="absolute right-0 top-full z-10 mt-1 w-60 rounded-md border border-line bg-surface p-3 shadow-lg">
          <TrashAction noteId={noteId} taskCount={taskCount} pending={pending} />
        </div>
      </details>
    </header>
  );
}

/**
 * 휴지통으로 보내기.
 *
 * 두 단계로 나눈다. 이 노트의 할 일이 목록에서 같이 사라지기 때문에
 * 한 번에 지워지면 곤란하다. 몇 개가 딸려 가는지 숫자로 알려 준다.
 */
function TrashAction({
  noteId,
  taskCount,
  pending,
}: {
  noteId: string;
  taskCount: number;
  pending: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, startTransition] = useTransition();

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-ink-2 transition-colors hover:bg-accent-soft hover:text-accent"
      >
        <Trash2 className="size-3.5" />
        휴지통으로 보내기
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs leading-relaxed text-ink-2">
        이 노트를 휴지통으로 보냅니다.
        {taskCount > 0 && (
          <>
            {" "}
            딸린 <b className="text-ink">할 일 {taskCount}건</b>도 목록에서 사라집니다.
          </>
        )}
      </p>
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="flex-1 rounded border border-line px-2 py-1 text-xs text-ink-2 transition-colors hover:bg-surface-2"
        >
          취소
        </button>
        <button
          type="button"
          disabled={pending || busy}
          onClick={() => startTransition(() => void trashNote(noteId))}
          className="flex-1 rounded bg-accent px-2 py-1 text-xs text-on-accent transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          보내기
        </button>
      </div>
    </div>
  );
}
