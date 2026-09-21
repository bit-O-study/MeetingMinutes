import Link from "next/link";
import { CheckSquare, Home, Plus } from "lucide-react";

import type { Space } from "@/lib/db/schema";

/**
 * 좌측 네비게이션이 곧 내가 접근 가능한 범위 전부다.
 * 스페이스는 2~5개 수준이라 접기나 트리 구조를 두지 않고 전부 펼친다.
 */
export function Sidebar({
  spaces,
  openTaskCount,
}: {
  spaces: Space[];
  openTaskCount: number;
}) {
  return (
    <nav className="hidden md:flex w-56 flex-none flex-col gap-1 border-r border-line bg-surface px-3 py-4">
      <SidebarLink href="/" icon={<Home className="size-4" />} label="홈" />
      <SidebarLink
        href="/tasks"
        icon={<CheckSquare className="size-4" />}
        label="내 할 일"
        badge={openTaskCount > 0 ? openTaskCount : undefined}
      />

      <div className="mt-4 mb-1 px-2 font-mono text-[10px] uppercase tracking-[0.09em] text-ink-3">
        스페이스
      </div>

      {spaces.map((space) => (
        <Link
          key={space.id}
          href={`/s/${space.id}`}
          className="truncate rounded px-2 py-1.5 text-sm text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
        >
          {space.name}
        </Link>
      ))}

      {spaces.length === 0 && (
        <p className="px-2 py-1 text-xs leading-relaxed text-ink-3">
          아직 스페이스가 없습니다.
        </p>
      )}

      <Link
        href="/spaces/new"
        className="mt-1 flex items-center gap-1.5 rounded px-2 py-1.5 text-sm text-accent transition-colors hover:bg-accent-soft"
      >
        <Plus className="size-3.5" />
        새 스페이스
      </Link>
    </nav>
  );
}

function SidebarLink({
  href,
  icon,
  label,
  badge,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  badge?: number;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
    >
      {icon}
      <span className="flex-1">{label}</span>
      {badge !== undefined && (
        <span className="rounded bg-accent-soft px-1.5 font-mono text-[10px] text-accent">
          {badge}
        </span>
      )}
    </Link>
  );
}
