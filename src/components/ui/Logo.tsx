import { useId } from "react";

/**
 * 앱 이름과 로고 — moa(모아). 대화·노트·이슈를 한곳에 모은다는 뜻(2026-10-14, '프로젝트 메모'에서 변경).
 * 기호: 코랄→핑크→보라 바탕 위 굵은 흰 "m" + 노란 반짝이 점. 기본 앱 같은 파랑 네모가 밋밋하다는 의견으로 바꿨다.
 * 색은 브랜드 토큰(--brand-*, globals.css). 안드로이드 아이콘(res/drawable/ic_moa_*)과 같은 그림이다.
 */
export const APP_NAME = "moa";

export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  // 한 화면에 로고가 여러 번 나와도 그라데이션 id 가 겹치지 않게.
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 108 108" aria-hidden="true" className={className}>
      <defs>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: "var(--brand-1)" }} />
          <stop offset="0.5" style={{ stopColor: "var(--brand-2)" }} />
          <stop offset="1" style={{ stopColor: "var(--brand-3)" }} />
        </linearGradient>
      </defs>
      <rect width="108" height="108" rx="30" fill={`url(#${id}g)`} />
      <path d="M31,76V54a12,12 0 0 1 24,0V76M55,54a12,12 0 0 1 24,0V76" fill="none" className="stroke-white" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="82" cy="30" r="8.5" style={{ fill: "var(--brand-spark)" }} />
    </svg>
  );
}

export function Logo({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ""}`}>
      <LogoMark size={size} />
      <span className="text-[19px] leading-none font-black tracking-[-0.04em] text-ink">{APP_NAME}</span>
    </span>
  );
}
