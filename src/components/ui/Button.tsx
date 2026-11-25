import Link from "@/components/PendingLink";
import { cn } from "@/lib/utils";

/** 프로젝트와 관계없이 조작부의 모양과 강조색을 유지한다. */
const VARIANTS = {
  primary: "bg-accent text-on-accent hover:brightness-110",
  secondary: "bg-accent-soft text-accent hover:brightness-[0.98]",
  ghost: "bg-surface text-ink ring-1 ring-inset ring-line hover:bg-surface-2",
  danger: "bg-danger-soft text-danger hover:brightness-[0.98]",
} as const;
const SIZES = {
  sm: "h-8 rounded-lg px-3 text-[13px]",
  md: "h-10 rounded-lg px-4 text-sm",
} as const;

export type ButtonVariant = keyof typeof VARIANTS;

export function buttonClass(variant: ButtonVariant = "primary", size: keyof typeof SIZES = "md", className?: string) {
  return cn(
    "ui-button inline-flex shrink-0 items-center justify-center gap-2 font-medium whitespace-nowrap [&>svg]:shrink-0",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45",
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}

export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  className,
  children,
}: {
  href: string;
  variant?: ButtonVariant;
  size?: keyof typeof SIZES;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)}>
      {children}
    </Link>
  );
}

/** 입력칸 공용 클래스 — 테두리 대신 안쪽 선, 누르면 강조색 테두리. */
export const fieldClass =
  "ui-input h-10 w-full min-w-0 rounded-lg bg-surface px-3.5 text-[15px] text-ink ring-1 ring-inset ring-line placeholder:text-ink-3 focus:ring-2 focus:ring-accent focus:outline-none";
