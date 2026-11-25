import { CalendarDays, CheckSquare, FolderClosed, Home } from "lucide-react";
import { NavLink } from "@/components/shell/NavLink";
import styles from "./Navigation.module.css";
import { AccountMenu } from "./AccountMenu";
import { signOut } from "@/lib/auth";

/** 데스크톱 사이드바와 같은 구조: 홈 · 프로젝트 · 할 일 · 일정 · 계정. 검색은 상단바에 있다. */
export function BottomNav({ openTaskCount, user }: { openTaskCount: number; user: { id: string; name?: string | null; image?: string | null } }) {
  return <nav aria-label="아래 메뉴" className={`app-bottomnav ${styles.bottom}`}>
    <NavLink href="/" exact className="bottom-tab" activeClassName="bottom-tab-active"><Home className="size-5" />홈</NavLink>
    <NavLink href="/projects" activePaths={["/s"]} className="bottom-tab" activeClassName="bottom-tab-active"><FolderClosed className="size-5" />프로젝트</NavLink>
    <NavLink href="/tasks" className="bottom-tab relative" activeClassName="bottom-tab-active"><CheckSquare className="size-5" />할 일
      {openTaskCount > 0 && <span aria-label={`미완료 ${openTaskCount}개`} className={styles.count}>{openTaskCount > 99 ? "99+" : openTaskCount}</span>}
    </NavLink>
    <NavLink href="/calendar" className="bottom-tab" activeClassName="bottom-tab-active"><CalendarDays className="size-5" />일정</NavLink>
    <div className="bottom-tab"><AccountMenu user={user} signOutAction={async () => { "use server"; await signOut({ redirectTo: "/login" }); }} /></div>
  </nav>;
}
