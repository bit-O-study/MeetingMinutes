import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * 카드 골격. 선 대신 면으로 묶는다(재디자인) — 맑은 바탕 위 흰 면 + 둥근 모서리.
 * accent 는 테두리 대신 옅은 강조 면으로 표시한다.
 */
export function Card({
  children,
  className,
  tone = "plain",
}: {
  children: React.ReactNode;
  className?: string;
  tone?: "plain" | "accent";
}) {
  return (
    <section
      className={cn(
        "rounded-2xl",
        tone === "accent" ? "bg-accent-soft" : "bg-surface",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function CardTitle({
  children,
  tone = "plain",
  action,
}: {
  children: React.ReactNode;
  tone?: "plain" | "accent";
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 px-4 pt-4 pb-1">
      {/* 영문 대문자 고정폭 라벨은 설계 문서처럼 보여 한글 굵은 제목으로(재디자인). */}
      <h2
        className={cn(
          "text-[15px] font-extrabold tracking-tight",
          tone === "accent" ? "text-accent" : "text-ink",
        )}
      >
        {children}
      </h2>
      {action && <div className="ml-auto">{action}</div>}
    </div>
  );
}

export function SectionHeading({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-3">
      <h1 className="text-2xl font-black tracking-tight text-ink">{children}</h1>
      {action && <div className="ml-auto">{action}</div>}
    </div>
  );
}

/** 빈 카드는 소음이다. 블록 자체를 숨길 수 없을 때만 쓴다. */
export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      <EmptyArt />
      <p className="mt-2 text-[15px] font-bold text-ink">{title}</p>
      {hint && <p className="max-w-xs text-[13px] leading-relaxed text-ink-2">{hint}</p>}
      {action && (
        <Link
          href={action.href}
          className="press mt-2 inline-flex h-10 items-center rounded-xl bg-accent-soft px-4 text-sm font-bold text-accent"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}

/**
 * 권한 없음과 존재하지 않음을 같은 화면으로 처리한다.
 * 노트 제목·스페이스명을 절대 표시하지 않는다 — 존재 여부 자체가 정보다.
 */
export function AccessDenied() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-20 text-center">
      <EmptyArt />
      <p className="mt-2 text-lg font-extrabold text-ink">접근할 수 없습니다</p>
      <p className="max-w-xs text-sm leading-relaxed text-ink-2">
        이 노트가 있는 스페이스의 멤버가 아닙니다.
      </p>
      <Link
        href="/"
        className="press mt-2 inline-flex h-10 items-center rounded-xl bg-surface px-4 text-sm font-bold text-ink"
      >
        홈으로
      </Link>
    </div>
  );
}

/**
 * 빈 화면 그림 — 겹친 카드 두 장과 체크 줄. 글자만 있던 빈 화면이 '고장'처럼 보여서 넣었다.
 * 색은 토큰(accent 는 프로젝트 안이면 그 프로젝트 색)을 따른다.
 */
function EmptyArt() {
  return (
    <div className="relative h-20 w-28" aria-hidden="true">
      <div className="absolute top-3 left-2 h-14 w-[70px] -rotate-6 rounded-xl bg-accent-soft" />
      <div className="absolute top-1 left-7 h-16 w-[72px] rounded-xl bg-surface shadow-float">
        <div className="absolute top-4 left-3 size-3 rounded bg-accent" />
        <div className="absolute top-[18px] left-8 h-1.5 w-7 rounded-full bg-line" />
        <div className="absolute top-9 left-3 size-3 rounded border-2 border-line" />
        <div className="absolute top-[42px] left-8 h-1.5 w-5 rounded-full bg-line" />
      </div>
    </div>
  );
}
