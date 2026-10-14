"use client";

import { useFormStatus } from "react-dom";

// 중복 제출을 막고, 접근 권한이 바뀌는 작업은 결과를 확인한 뒤 실행한다.
export function ActionSubmit({ children, confirmation, wide = false }: { children: React.ReactNode; confirmation?: string; wide?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}
      onClick={(event) => { if (confirmation && !window.confirm(confirmation)) event.preventDefault(); }}
      // 확인을 묻는 작업(삭제·제외·나가기·회수)은 되돌리기 어려워 주 버튼처럼 보이지 않게 옅은 빨강으로 둔다.
      className={`press inline-flex h-11 items-center justify-center gap-1.5 rounded-2xl px-5 text-sm font-bold disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-wait ${wide ? "w-full " : ""}${
        confirmation ? "bg-danger-soft text-danger hover:brightness-95" : "bg-accent text-on-accent shadow-sm hover:brightness-105"
      }`}>
      {pending ? "처리 중…" : children}
    </button>
  );
}
