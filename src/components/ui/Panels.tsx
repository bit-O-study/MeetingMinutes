import Link from "next/link";
import { cn } from "@/lib/utils";

/** 화면 설계서의 카드 골격. 테두리·배경을 화면마다 다시 정하지 않도록 한다. */
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
        "rounded-md border bg-surface",
        tone === "accent" ? "border-accent" : "border-line",
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
    <div className="flex items-center gap-2 px-4 pt-3 pb-1">
      <h2
        className={cn(
          "font-mono text-[10px] font-semibold uppercase tracking-[0.09em]",
          tone === "accent" ? "text-accent" : "text-ink-3",
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
    <div className="mb-4 flex flex-wrap items-center gap-3 border-b border-line pb-2">
      <h1 className="font-serif text-xl font-semibold text-ink">{children}</h1>
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
      <p className="text-sm font-medium text-ink-2">{title}</p>
      {hint && <p className="max-w-xs text-xs leading-relaxed text-ink-3">{hint}</p>}
      {action && (
        <Link
          href={action.href}
          className="mt-1 rounded bg-accent px-3 py-1.5 text-xs text-on-accent transition-opacity hover:opacity-90"
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
      <div className="size-7 rounded-full border border-line-2" />
      <p className="font-serif text-base font-semibold text-ink">접근할 수 없습니다</p>
      <p className="max-w-xs text-sm leading-relaxed text-ink-2">
        이 노트가 있는 스페이스의 멤버가 아닙니다.
      </p>
      <Link
        href="/"
        className="mt-1 rounded border border-line px-3 py-1.5 text-xs text-ink-2 transition-colors hover:bg-surface-2"
      >
        홈으로
      </Link>
    </div>
  );
}
