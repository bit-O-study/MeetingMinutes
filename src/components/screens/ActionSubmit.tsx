"use client";

import { useFormStatus } from "react-dom";

// 중복 제출을 막고, 접근 권한이 바뀌는 작업은 결과를 확인한 뒤 실행한다.
export function ActionSubmit({ children, confirmation }: { children: React.ReactNode; confirmation?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}
      onClick={(event) => { if (confirmation && !window.confirm(confirmation)) event.preventDefault(); }}
      className="rounded border border-line bg-surface px-3 py-2 text-sm text-ink-2 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-wait disabled:opacity-50">
      {pending ? "처리 중…" : children}
    </button>
  );
}
