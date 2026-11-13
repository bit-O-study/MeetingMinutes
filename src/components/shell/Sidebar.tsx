import { CalendarDays, CheckSquare, FolderClosed, Home, Plus, Search } from "lucide-react";

import type { Space } from "@/lib/db/schema";
import { NavLink } from "@/components/shell/NavLink";
import Link from "@/components/PendingLink";
import { Logo } from "@/components/ui/Logo";
import { PROJECT_SCOPE_CLASS, projectColor } from "@/components/ui/projectColor";
import { AccountMenu } from "./AccountMenu";
import { signOut } from "@/lib/auth";

/**
 * 좌측 네비게이션이 곧 내가 접근 가능한 범위 전부다.
 * 스페이스는 2~5개 수준이라 접기나 트리 구조를 두지 않고 전부 펼친다.
 * 재디자인: 프로젝트마다 색 아이콘, 지금 있는 곳은 옅은 강조 면으로.
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
  const item =
    "sidebar-link";
  const on = "sidebar-link-active";
  return (
    <nav aria-label="주 메뉴" className="app-sidebar">
      <Link href="/" className="sidebar-brand" aria-label="모아 홈"><Logo /></Link>
      <NavLink href="/" exact className={item} activeClassName={on}>
        <Home className="size-4" /> 홈
      </NavLink>
      <NavLink href="/projects" className={item} activeClassName={on}>
        <FolderClosed className="size-4" /> 프로젝트
      </NavLink>
      <NavLink href="/calendar" className={item} activeClassName={on}>
        <CalendarDays className="size-4" /> 개인 일정
      </NavLink>
      <NavLink href="/tasks" className={item} activeClassName={on}>
        <CheckSquare className="size-4" />
        <span className="flex-1">내 할 일</span>
        {openTaskCount > 0 && (
          <span className="ml-auto rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-ink-2">
            {openTaskCount}
          </span>
        )}
      </NavLink>
      <NavLink href="/search" className={item} activeClassName={on}>
        <Search className="size-4" /> 검색
      </NavLink>

      <div className="sidebar-label mt-7">프로젝트</div>

      {spaces.map((space) => (
        <NavLink key={space.id} href={`/s/${space.id}`} className={item} activeClassName={on}>
          <span aria-hidden="true" className={`sidebar-project-dot ${PROJECT_SCOPE_CLASS[projectColor(space.id)]}`} />
          <span className="min-w-0 truncate">{space.name}</span>
        </NavLink>
      ))}

      {spaces.length === 0 && (
        <p className="px-2.5 py-1 text-xs leading-relaxed text-ink-3">아직 프로젝트가 없어요.</p>
      )}

      <NavLink href="/spaces/new" className={`${item} text-ink-3`} activeClassName={on}>
        <span className="grid size-6 place-items-center rounded-lg ring-1 ring-inset ring-line">
          <Plus className="size-3.5" />
        </span>
        새 프로젝트
      </NavLink>
      <div className="sidebar-account"><AccountMenu user={user} showName signOutAction={async () => {
        "use server";
        await signOut({ redirectTo: "/login" });
      }} /></div>
    </nav>
  );
}
