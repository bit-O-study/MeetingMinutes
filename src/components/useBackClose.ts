"use client";

import { useEffect, useRef } from "react";

/**
 * 열린 시트·패널을 뒤로가기로 닫는다.
 *
 * 안드로이드 앱(WebView)의 뒤로가기는 `history.back()`이다. 시트를 열 때 기록을 하나
 * 쌓지 않으면 뒤로가기가 시트를 닫지 않고 이전 화면으로 가 버린다. 휴대폰 브라우저도 같다.
 *
 * - 열릴 때 같은 주소로 기록을 하나 쌓는다(Next 라우터가 내부 상태를 복사해 둔다).
 * - 뒤로가기(popstate)로 그 기록이 빠지면 닫는다.
 * - 화면 버튼으로 닫으면 쌓아 둔 기록을 직접 걷어 낸다. 단, 그 사이 다른 화면으로
 *   이동했다면(맨 위 기록이 내 것이 아니면) 걷지 않는다 — 걷으면 방금 한 이동이 취소된다.
 */
export function useBackClose(open: boolean, close: () => void) {
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  }, [close]);

  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    const marker = Math.random().toString(36).slice(2);
    window.history.pushState({ __overlay: marker }, "");
    let popped = false;

    const onPop = () => {
      // 위에 겹친 다른 시트의 기록이 빠진 것이면 내 기록은 아직 남아 있다.
      if ((window.history.state as { __overlay?: string } | null)?.__overlay === marker) return;
      popped = true;
      closeRef.current();
    };
    window.addEventListener("popstate", onPop);

    return () => {
      window.removeEventListener("popstate", onPop);
      if (!popped && (window.history.state as { __overlay?: string } | null)?.__overlay === marker) {
        window.history.back();
      }
    };
  }, [open]);
}
