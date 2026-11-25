"use client";

import { usePathname, useSearchParams } from "next/navigation";
import Link from "@/components/PendingLink";
import { PROJECT_SCOPE_CLASS, projectColor } from "@/components/ui/projectColor";
import { cn } from "@/lib/utils";

// 프로젝트 화면의 탭과 같은 값·같은 이름. 화면 쪽 탭이 바뀌면 여기도 같이 바꾼다.
const TABS = [
  { value: "chat", label: "대화" },
  { value: "notes", label: "노트" },
  { value: "tasks", label: "할 일" },
  { value: "meetings", label: "일정" },
  { value: "issues", label: "이슈" },
] as const;

/**
 * 프로젝트 목록. 지금 들어와 있는 프로젝트만 펼쳐서 탭으로 바로 가게 한다.
 * 전부 펼치면 프로젝트가 늘 때 사이드바가 길어지고, 전부 접으면 한 번 더 눌러야 한다.
 */
export function ProjectTree({ spaces }: { spaces: { id: string; name: string }[] }) {
  const path = usePathname() ?? "";
  const params = useSearchParams();
  const currentTab = params.get("tab") ?? "chat";
  return (
    <>
      {spaces.map((space) => {
        const base = `/s/${space.id}`;
        const inside = path === base || path.startsWith(`${base}/`);
        const onNote = path.startsWith(`${base}/n/`);
        return (
          <div key={space.id} className="flex flex-col">
            <Link href={base} aria-current={path === base && !params.get("tab") ? "page" : undefined}
              className={cn("sidebar-link", inside && "sidebar-link-open")}>
              <span aria-hidden="true" className={`sidebar-project-dot ${PROJECT_SCOPE_CLASS[projectColor(space.id)]}`} />
              <span className="min-w-0 truncate">{space.name}</span>
            </Link>
            {inside && TABS.map((tab) => {
              const on = path === base && currentTab === tab.value && (params.get("tab") !== null || tab.value === "chat");
              return (
                <Link key={tab.value} href={`${base}?tab=${tab.value}`} aria-current={on ? "page" : undefined}
                  className={cn("sidebar-link sidebar-child", on && "sidebar-link-active", onNote && tab.value === "notes" && "sidebar-link-open")}>
                  {tab.label}
                </Link>
              );
            })}
          </div>
        );
      })}
    </>
  );
}
