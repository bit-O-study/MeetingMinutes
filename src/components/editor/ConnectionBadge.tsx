"use client";

import { useEffect, useState } from "react";
import type { ConnectionState } from "@/lib/collab/useCollab";

/**
 * 저장 버튼이 없으므로 이 표시가 유일한 안심 신호다.
 * 서버 확인 전에는 저장을 보장하는 문구를 쓰지 않는다.
 */
export function ConnectionBadge({
  status,
  syncedAt,
  pending = false,
}: {
  status: ConnectionState;
  /** 서버가 DB 커밋을 확인한 시각. 단순 연결/로컬 입력 시각과 다르다. */
  syncedAt: Date | null;
  pending?: boolean;
}) {
  // "N분 전"은 시간이 흐르면 바뀌어야 한다. 다시 그릴 계기가 없으면 처음 문구에 멈춘다.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!syncedAt) return;
    const refresh = () => setNow(Date.now());
    const timer = setInterval(refresh, 1000);
    document.addEventListener("visibilitychange", refresh);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, [syncedAt]);

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
      연결됨{pending ? " · 저장 확인 중…" : syncedAt ? ` · ${timeLabel(syncedAt, Math.max(now, syncedAt.getTime()))} 반영` : " · 저장 확인 대기"}
    </span>
  );
}

function timeLabel(at: Date, now: number) {
  const secs = Math.floor((now - at.getTime()) / 1000);
  if (secs < 10) return "방금";
  if (secs < 60) return `${secs}초 전`;
  return `${Math.floor(secs / 60)}분 전`;
}
