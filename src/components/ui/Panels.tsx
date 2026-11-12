import Link from "@/components/PendingLink";
import { cn } from "@/lib/utils";

/**
 * 같은 정보 묶음에만 경계와 얕은 그림자를 사용해 중첩된 상자의 시각적 부담을 줄인다.
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
        "ui-card",
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
          "text-[15px] font-semibold tracking-tight",
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
      <h1 className="page-title">{children}</h1>
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
      <span className="empty-mark" aria-hidden="true">—</span>
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
      <span className="empty-mark" aria-hidden="true">—</span>
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

