import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * 공용 버튼 모양 — 재디자인 전에는 화면마다 버튼 클래스를 따로 적어 모양이 제각각이었다.
 * 프로젝트 안에서는 accent 가 그 프로젝트 색이라 버튼도 따라 바뀐다.
 */
const VARIANTS = {
  primary: "bg-accent text-on-accent shadow-sm hover:brightness-105",
  secondary: "bg-accent-soft text-accent hover:brightness-[0.98]",
  ghost: "bg-surface text-ink ring-1 ring-inset ring-line hover:bg-surface-2",
  danger: "bg-danger-soft text-danger hover:brightness-[0.98]",
} as const;
const SIZES = {
  sm: "h-9 rounded-xl px-3 text-[13px]",
  md: "h-11 rounded-2xl px-4 text-sm",
} as const;

export type ButtonVariant = keyof typeof VARIANTS;

export function buttonClass(variant: ButtonVariant = "primary", size: keyof typeof SIZES = "md", className?: string) {
  return cn(
    "press inline-flex items-center justify-center gap-1.5 font-bold whitespace-nowrap transition-[filter,background-color]",
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
  "h-11 w-full rounded-2xl bg-surface px-3.5 text-[15px] text-ink ring-1 ring-inset ring-line placeholder:text-ink-3 focus:ring-2 focus:ring-accent focus:outline-none";
