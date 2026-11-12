import { CalendarDays, CheckSquare, FolderClosed, Home } from "lucide-react";
import { NavLink } from "@/components/shell/NavLink";
import styles from "./Navigation.module.css";

export function BottomNav({ openTaskCount }: { openTaskCount: number }) {
  return <nav aria-label="아래 메뉴" className={`app-bottomnav ${styles.bottom}`}>
    <NavLink href="/" exact className="bottom-tab" activeClassName="bottom-tab-active"><Home className="size-5" />홈</NavLink>
    <NavLink href="/projects" activePaths={["/s", "/spaces"]} className="bottom-tab" activeClassName="bottom-tab-active"><FolderClosed className="size-5" />프로젝트</NavLink>
    <NavLink href="/calendar" className="bottom-tab" activeClassName="bottom-tab-active"><CalendarDays className="size-5" />일정</NavLink>
    <NavLink href="/tasks" className="bottom-tab relative" activeClassName="bottom-tab-active"><CheckSquare className="size-5" />할 일
      {openTaskCount > 0 && <span aria-label={`미완료 ${openTaskCount}개`} className={styles.count}>{openTaskCount > 99 ? "99+" : openTaskCount}</span>}
    </NavLink>
  </nav>;
}
