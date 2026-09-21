"use client";

import { AccessDenied } from "@/components/ui/Panels";

/**
 * 권한 없음과 존재하지 않음을 같은 화면으로 처리한다.
 * 노트 제목·스페이스명을 절대 노출하지 않는다 — 존재 여부 자체가 정보다.
 */
export default function AppError({ error }: { error: Error & { digest?: string } }) {
  const denied =
    error.name === "NotAccessibleError" || error.message.includes("접근할 수 없습니다");

  if (denied) return <AccessDenied />;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-20 text-center">
      <p className="font-serif text-base font-semibold text-ink">문제가 생겼습니다</p>
      <p className="max-w-sm text-sm leading-relaxed text-ink-2">
        잠시 후 다시 시도해 주세요. 계속되면 개발 콘솔의 오류를 확인하세요.
      </p>
      {error.digest && (
        <code className="font-mono text-[10px] text-ink-3">{error.digest}</code>
      )}
    </div>
  );
}
