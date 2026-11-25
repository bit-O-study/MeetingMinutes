"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
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
  connection,
}: {
  noteId: string;
  spaceId: string;
  spaceName: string;
  title: string;
  status: NoteStatus;
  /** 서버에서 만든 문구를 그대로 받는다. 클라이언트에서 다시 계산하면 첫 렌더가 어긋난다. */
  updatedLabel: string;
  taskCount: number;
  connection?: ReactNode;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [status, setStatus] = useState(initialStatus);
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const menuRef = useRef<HTMLDetailsElement>(null);

  /**
   * 화면을 먼저 바꾸고 저장한다. 실패하면 되돌리고 알린다 —
   * 예전에는 실패를 삼켜서, 바뀐 줄 알았던 제목·상태가 새로고침하면 돌아와 있었다.
   */
  function commitTitle(next: string) {
    const trimmed = next.trim();
    setEditing(false);
    if (!trimmed || trimmed === title) return;
    const previous = title;
    setTitle(trimmed);
    startTransition(async () => {
      try { await renameNote(noteId, trimmed); setError(""); }
      catch { setTitle(previous); setError("제목을 바꾸지 못했습니다. 다시 시도하세요."); }
    });
  }

  /**
   * 작성 중 ↔ 정리됨.
   * 잠금이 아니라 목록에서 구분하기 위한 표시다. 누구나 바꾸고 되돌릴 수 있으므로
   * 확인을 묻지 않는다.
   */
  function toggleStatus() {
    const previous = status;
    const next: NoteStatus = status === "tidied" ? "draft" : "tidied";
    setStatus(next);
    startTransition(async () => {
      try { await setNoteStatus(noteId, next); setError(""); }
      catch { setStatus(previous); setError("상태를 바꾸지 못했습니다. 다시 시도하세요."); }
    });
  }

  return (
    <header className="note-heading flex min-w-0 flex-none flex-col border-b border-line bg-surface">
      {/* 위 줄: 어디에 있는지(브레드크럼)와 연결 상태·메뉴. 어느 노트에서나 같은 높이다. */}
      <div className="flex min-h-11 min-w-0 items-center gap-2 px-4 md:px-6">
        <Link href={`/s/${spaceId}?tab=notes`} className="min-w-0 truncate text-[13px] text-ink-3 transition-colors hover:text-ink">
          {spaceName}
        </Link>
        <span aria-hidden="true" className="text-ink-3">/</span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{title}</span>
        <div data-testid="note-connection" className="shrink-0">{connection}</div>

        {/* details를 쓰면 바깥 클릭으로 닫히는 동작과 키보드 접근을 브라우저가 처리한다. */}
        <details ref={menuRef} className="relative shrink-0">
          <summary
            aria-label="노트 메뉴"
            className="flex size-8 cursor-pointer list-none items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink [&::-webkit-details-marker]:hidden"
          >
            <MoreHorizontal className="size-4" />
          </summary>

          <div className="absolute right-0 top-full z-10 mt-1 w-64 max-w-[calc(100vw-2rem)] rounded-[var(--radius-panel)] border border-line bg-surface p-3 shadow-float">
            <TrashAction noteId={noteId} taskCount={taskCount} pending={pending} />
          </div>
        </details>
      </div>

      {/* 제목과 속성은 본문과 같은 폭·같은 왼쪽 선에 맞춘다. */}
      <div className="mx-auto w-full max-w-[720px] min-w-0 px-4 pb-4 pt-5 md:px-6">
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
            className="w-full min-w-0 rounded-md bg-surface px-1 py-0.5 text-2xl font-bold tracking-tight text-ink ring-2 ring-accent outline-none md:text-[28px]"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            title="클릭해서 제목 수정"
            className="block min-w-0 max-w-full break-words rounded-md px-1 py-0.5 text-left font-sans text-2xl font-bold tracking-tight text-ink transition-colors hover:bg-surface-2 md:text-[28px]"
          >
            {title}
          </button>
        )}

        <dl className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs">
          <div className="flex items-center gap-2">
            <dt className="text-ink-3">상태</dt>
            <dd>
              <button type="button" onClick={toggleStatus} disabled={pending} title="상태 바꾸기" className="whitespace-nowrap">
                <NoteStatusBadge status={status} />
              </button>
            </dd>
          </div>
          <div className="flex items-center gap-2"><dt className="text-ink-3">수정</dt><dd className="text-ink-2">{updatedLabel.replace(/ 수정$/, "")}</dd></div>
          <div className="flex items-center gap-2"><dt className="text-ink-3">할 일</dt><dd className="text-ink-2">{taskCount}건</dd></div>
        </dl>
        {error && <p role="alert" className="mt-2 text-xs font-semibold text-warn">{error}</p>}
      </div>
    </header>
  );
}

/**
 * 노트 삭제.
 *
 * 휴지통 화면·복원·30일 뒤 정리가 아직 없다. "휴지통"이라고 쓰면 되살릴 수 있다고 믿게 되므로
 * 복구할 수 없다고 그대로 알린다(복원 화면을 만들면 문구를 되돌린다).
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
        노트 삭제
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs leading-relaxed text-ink-2">
        이 노트를 삭제합니다. <b className="text-ink">복구할 수 없습니다.</b>
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
          className="min-h-9 shrink-0 whitespace-nowrap rounded border border-line px-3 py-1 text-xs text-ink-2 transition-colors hover:bg-surface-2"
        >
          취소
        </button>
        <button
          type="button"
          disabled={pending || busy}
          onClick={() => startTransition(async () => { await trashNote(noteId); })}
          className="min-h-9 flex-1 whitespace-nowrap rounded bg-accent px-3 py-1 text-xs text-on-accent transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          삭제(복구 불가)
        </button>
      </div>
    </div>
  );
}
