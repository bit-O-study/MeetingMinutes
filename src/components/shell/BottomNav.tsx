"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, CheckSquare, Home, Search, UserRound } from "lucide-react";

import { NavLink } from "@/components/shell/NavLink";
import { Avatar } from "@/components/ui/Avatar";

/**
 * 휴대폰 아래 메뉴(재디자인). 처음엔 떠 있는 둥근 카드였는데 '둥둥 떠 있다'는 의견으로
 * 화면 맨 아래에 붙는 일반 하단바로 바꿨다(2026-10-14).
 * — 지금까지 휴대폰에서는 왼쪽 메뉴가 숨겨져 갈 곳이 없었다
 * (앱에서 '내 할 일'은 홈 카드로만 들어갈 수 있었다). '나'는 따로 화면이 없어 시트로 연다.
 */
export function BottomNav({
  user,
  openTaskCount,
  signOutAction,
}: {
  user: { id: string; name?: string | null; image?: string | null };
  openTaskCount: number;
  signOutAction: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const accountDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    // 기본 dialog가 배경 포커스를 차단하고 닫힌 뒤 원래 버튼으로 돌려준다.
    if (open) accountDialog.current?.showModal();
  }, [open]);

  const tab = "bottom-tab";
  const on = "bottom-tab-active";
  return (
    <>
      <nav
        aria-label="아래 메뉴"
        className="app-bottomnav"
      >
        <NavLink href="/" exact className={tab} activeClassName={on}>
          <Home className="size-5" />홈
        </NavLink>
        <NavLink href="/calendar" className={tab} activeClassName={on}>
          <CalendarDays className="size-5" />일정
        </NavLink>
        <NavLink href="/tasks" className={`${tab} relative`} activeClassName={on}>
          <CheckSquare className="size-5" />할 일
          {openTaskCount > 0 && (
            <span className="absolute top-0.5 left-1/2 ml-2 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] text-white">
              {openTaskCount}
            </span>
          )}
        </NavLink>
        <NavLink href="/search" className={tab} activeClassName={on}>
          <Search className="size-5" />검색
        </NavLink>
        <button type="button" onClick={() => setOpen(true)} className={tab} aria-haspopup="dialog">
          <UserRound className="size-5" />나
        </button>
      </nav>

      {open && (
        <dialog ref={accountDialog} onClose={() => setOpen(false)} onCancel={() => setOpen(false)} className="account-dialog" aria-label="내 계정">
          <button type="button" aria-label="닫기" className="absolute inset-0 bg-ink/40" onClick={() => setOpen(false)} />
          <div
            className="absolute inset-x-0 bottom-0 flex flex-col gap-3 account-sheet rounded-t-2xl bg-surface px-5 pt-3 shadow-float"
            style={{ paddingBottom: "calc(var(--safe-bottom) + 20px)" }}
          >
            <div className="mx-auto h-1 w-10 rounded-full bg-line" />
            <div className="flex items-center gap-3 py-1">
              <Avatar name={user.name} image={user.image} seed={user.id} size={40} />
              <div className="min-w-0">
                <p className="truncate text-base font-extrabold text-ink">{user.name ?? "나"}</p>
                <p className="text-xs text-ink-3">화면 밝기는 휴대폰 설정을 따라요</p>
              </div>
            </div>
            <form action={signOutAction}>
              <button type="submit" className="press h-11 w-full rounded-2xl bg-surface-2 text-sm font-bold text-ink">
                로그아웃
              </button>
            </form>
          </div>
        </dialog>
      )}
    </>
  );
}
