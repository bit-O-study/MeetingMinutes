"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * 지금 있는 곳을 표시하는 메뉴 링크. 서버 셸에서 현재 주소를 알 수 없어 이것만 클라이언트로 둔다.
 * exact 가 아니면 하위 주소(/s/123/n/…)에서도 켜진다.
 */
export function NavLink({
  href,
  exact = false,
  className,
  activeClassName,
  children,
}: {
  href: string;
  exact?: boolean;
  className?: string;
  activeClassName?: string;
  children: React.ReactNode;
}) {
  const path = usePathname() ?? "";
  const active = exact ? path === href : path === href || path.startsWith(`${href}/`);
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={cn(className, active && activeClassName)}>
      {children}
    </Link>
  );
}
