/** 겹친 세 면은 서로의 기록을 한곳에 모으는 브랜드 형태다. */
export const APP_NAME = "모아";
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" className={className}>
    <circle cx="15" cy="16" r="12" fill="var(--brand-1)" />
    <circle cx="25" cy="16" r="12" fill="var(--brand-2)" fillOpacity=".9" />
    <circle cx="20" cy="26" r="12" fill="var(--brand-3)" fillOpacity=".9" />
    <path d="M9 21a12 12 0 0 1 22 0 12 12 0 0 1-22 0" fill="var(--brand-spark)" />
  </svg>;
}
export function Logo({ size = 24, className }: { size?: number; className?: string }) {
  return <span className={"inline-flex items-center gap-2 " + (className ?? "")}><LogoMark size={size} /><span className="text-base font-bold tracking-tight">{APP_NAME}</span></span>;
}
