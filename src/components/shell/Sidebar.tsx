import { Suspense } from "react";
import { CalendarDays, CheckSquare, Home, Plus } from "lucide-react";

import type { Space } from "@/lib/db/schema";
import { NavLink } from "@/components/shell/NavLink";
import Link from "@/components/PendingLink";
import { Logo } from "@/components/ui/Logo";
import { AccountMenu } from "./AccountMenu";
import { ProjectTree } from "./ProjectTree";
import { SearchButton } from "./SearchButton";
import { signOut } from "@/lib/auth";

/**
 * 좌측 네비게이션이 곧 내가 접근 가능한 범위 전부다.
 * 위쪽은 "나에게 속한 것"(홈·할 일·일정), 아래쪽은 프로젝트 트리.
 * 투표·자료는 프로젝트에 속한 기능이라 최상위에서 빼고 프로젝트 안과 Ctrl+K 로 간다.
 */
export function Sidebar({
  spaces,
  openTaskCount,
  user,
}: {
  spaces: Space[];
  openTaskCount: number;
  user: { id: string; name?: string | null; image?: string | null };
}) {
  const item = "sidebar-link";
  const on = "sidebar-link-active";
  return (
    <nav aria-label="주 메뉴" className="app-sidebar">
      <Link href="/" className="sidebar-brand" aria-label="모아 홈"><Logo /></Link>
      <SearchButton className="sidebar-link sidebar-search" />
      <NavLink href="/" exact className={item} activeClassName={on}>
        <Home className="size-4" /> 홈
      </NavLink>
      <NavLink href="/tasks" className={item} activeClassName={on}>
        <CheckSquare className="size-4" />
        <span className="flex-1">내 할 일</span>
        {openTaskCount > 0 && <span className="sidebar-count">{openTaskCount}</span>}
      </NavLink>
      <NavLink href="/calendar" className={item} activeClassName={on}>
        <CalendarDays className="size-4" /> 일정
      </NavLink>

      <div className="sidebar-label">
        <Link href="/projects" className="hover:text-ink-2">프로젝트</Link>
      </div>

      <Suspense fallback={null}>
        <ProjectTree spaces={spaces.map((s) => ({ id: s.id, name: s.name }))} />
      </Suspense>

      {spaces.length === 0 && (
        <p className="px-2.5 py-1 text-xs leading-relaxed text-ink-3">아직 프로젝트가 없어요.</p>
      )}

      <NavLink href="/spaces/new" className={`${item} text-ink-3`} activeClassName={on}>
        <Plus className="size-4" /> 새 프로젝트
      </NavLink>
      <div className="sidebar-account"><AccountMenu user={user} showName signOutAction={async () => {
        "use server";
        await signOut({ redirectTo: "/login" });
      }} /></div>
    </nav>
  );
}
