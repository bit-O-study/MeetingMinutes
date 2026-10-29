"use client";

import type { ConnectionState } from "@/lib/collab/useCollab";

/**
 * 저장 버튼이 없으므로 이 표시가 유일한 안심 신호다.
 * 서버 확인 전에는 저장을 보장하는 문구를 쓰지 않는다.
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
      <span role="status" title="오프라인 상태입니다. 입력을 보존하려면 이 창을 닫지 마세요." className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-danger-soft px-2 py-1 text-[10px] font-medium text-danger sm:text-[11px]">
        <span aria-hidden className="size-2 rounded-full bg-danger" />
        오프라인 · 창 유지
      </span>
    );
  }

  if (status === "connecting") {
    return (
      <span role="status" className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-warn-soft px-2 py-1 text-[10px] font-medium text-warn sm:text-[11px]">
        <span aria-hidden className="size-2 animate-pulse rounded-full bg-warn motion-reduce:animate-none" />
        {syncedAt ? "재연결 중…" : "연결 중…"}
      </span>
    );
  }

  return (
    <span role="status" className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-ok-soft px-2 py-1 text-[10px] font-medium text-ok sm:text-[11px]">
      <span aria-hidden className="size-2 rounded-full bg-ok" />
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
