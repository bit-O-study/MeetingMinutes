import { CalendarDays, CheckSquare, FolderDown, Home, Plus, Search } from "lucide-react";

import type { Space } from "@/lib/db/schema";
import { NavLink } from "@/components/shell/NavLink";
import { ProjectIcon } from "@/components/ui/ProjectIcon";

/**
 * 좌측 네비게이션이 곧 내가 접근 가능한 범위 전부다.
 * 스페이스는 2~5개 수준이라 접기나 트리 구조를 두지 않고 전부 펼친다.
 * 재디자인: 프로젝트마다 색 아이콘, 지금 있는 곳은 옅은 강조 면으로.
 */
export function Sidebar({
  spaces,
  openTaskCount,
}: {
  spaces: Space[];
  openTaskCount: number;
}) {
  const item =
    "flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-semibold text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink";
  const on = "bg-accent-soft text-ink";
  return (
    <nav className="hidden w-60 flex-none flex-col gap-0.5 border-r border-line bg-surface px-3 py-4 md:flex">
      <NavLink href="/" exact className={item} activeClassName={on}>
        <Home className="size-4" /> 홈
      </NavLink>
      <NavLink href="/calendar" className={item} activeClassName={on}>
        <CalendarDays className="size-4" /> 개인 일정
      </NavLink>
      <NavLink href="/tasks" className={item} activeClassName={on}>
        <CheckSquare className="size-4" />
        <span className="flex-1">내 할 일</span>
        {openTaskCount > 0 && (
          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-danger px-1.5 text-[11px] font-bold text-white">
            {openTaskCount}
          </span>
        )}
      </NavLink>
      <NavLink href="/files" className={item} activeClassName={on}>
        <FolderDown className="size-4" /> 자료실
      </NavLink>
      <NavLink href="/search" className={item} activeClassName={on}>
        <Search className="size-4" /> 검색
      </NavLink>

      <div className="mt-5 mb-1 px-2.5 text-xs font-bold text-ink-3">프로젝트</div>

      {spaces.map((space) => (
        <NavLink key={space.id} href={`/s/${space.id}`} className={item} activeClassName={on}>
          <ProjectIcon spaceId={space.id} name={space.name} size="sm" />
          <span className="truncate">{space.name}</span>
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
    </nav>
  );
}
