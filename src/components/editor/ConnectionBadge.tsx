"use client";

import type { ConnectionState } from "@/lib/collab/useCollab";

/**
 * 저장 버튼이 없으므로 이 표시가 유일한 안심 신호다.
 * 오프라인 문구에 "입력은 저장됩니다"를 붙여 작업을 멈추지 않게 한다.
 */
export function ConnectionBadge({
  status,
  syncedAt,
}: {
  status: ConnectionState;
  syncedAt: Date | null;
}) {
  if (status === "offline") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded bg-surface-2 px-2 py-0.5 font-mono text-[10px] text-ink-3">
        <span aria-hidden>○</span>
        오프라인 · 입력은 저장됩니다
      </span>
    );
  }

  if (status === "connecting") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded bg-warn-soft px-2 py-0.5 font-mono text-[10px] text-warn">
        <span aria-hidden>◐</span>
        재연결 중…
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded bg-ok-soft px-2 py-0.5 font-mono text-[10px] text-ok">
      <span aria-hidden>●</span>
      연결됨{syncedAt && ` · ${timeLabel(syncedAt)} 반영`}
    </span>
  );
}

function timeLabel(at: Date) {
  const secs = Math.floor((Date.now() - at.getTime()) / 1000);
  if (secs < 10) return "방금";
  if (secs < 60) return `${secs}초 전`;
  return `${Math.floor(secs / 60)}분 전`;
}
