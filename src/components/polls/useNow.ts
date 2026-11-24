import { useSyncExternalStore } from "react";

/**
 * "지금" — 남은 시간 표시용. 서버 렌더와 브라우저의 시각이 어긋나 하이드레이션이 깨지지 않도록
 * 서버에서는 null 이고, 브라우저에서는 30초마다 바뀐다. 30초 단위로 내림해 같은 구간에서는 같은 값을 돌려준다
 * (useSyncExternalStore 는 스냅샷이 매 호출 달라지면 무한 렌더가 된다).
 */
const TICK = 30_000;

function subscribe(notify: () => void) {
  const id = window.setInterval(notify, TICK);
  return () => window.clearInterval(id);
}

const snapshot = () => Math.floor(Date.now() / TICK) * TICK;

export function useNow(): Date | null {
  const ms = useSyncExternalStore(subscribe, snapshot, () => null);
  return ms === null ? null : new Date(ms);
}
