/**
 * 앱 이름과 로고 — moa(모아). 대화·노트·이슈를 한곳에 모은다는 뜻(2026-10-14, '프로젝트 메모'에서 변경).
 * 기호: 겹친 두 장(노트가 모인다) 위에 체크 — 정리된다는 뜻. 색은 토큰을 따르게 currentColor 로 그린다.
 */
export const APP_NAME = "moa";

export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className={className}>
      <rect width="32" height="32" rx="9" className="fill-accent" />
      <rect x="10.5" y="6.5" width="14" height="16" rx="3.5" className="fill-on-accent" opacity="0.45" />
      <rect x="7" y="9.5" width="14" height="16" rx="3.5" className="fill-on-accent" />
      <path d="M10.5 17.6l2.6 2.6 4.8-5.2" fill="none" className="stroke-accent" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
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
