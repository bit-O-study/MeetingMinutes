"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

const listeners = new Set<() => void>();

function subscribe(callback: () => void) {
  listeners.add(callback);
  window.addEventListener("storage", callback);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
}

function read(key: string): string {
  try {
    return window.localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

/**
 * 브라우저에 기억해 두는 문자열 집합(예: 꺼 둔 레이어).
 * 서버 렌더에서는 항상 비어 있고(모두 켜짐), 하이드레이션 뒤에 저장된 값으로 바뀐다.
 * 저장소를 못 쓰는 환경(사생활 보호 모드 등)에서는 조용히 기본값으로 동작한다.
 */
export function useStoredSet(key: string): [ReadonlySet<string>, (id: string) => void] {
  const raw = useSyncExternalStore(subscribe, () => read(key), () => "");
  const set = useMemo(() => new Set(raw ? raw.split(",") : []), [raw]);
  const toggle = useCallback(
    (id: string) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        window.localStorage.setItem(key, [...next].join(","));
      } catch {
        /* 저장하지 못해도 이번 화면에서는 동작한다 */
      }
      listeners.forEach((listener) => listener());
    },
    [key, set],
  );
  return [set, toggle];
}
