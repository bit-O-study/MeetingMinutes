"use client";

import { useRef, useSyncExternalStore } from "react";
import { X } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import styles from "./Navigation.module.css";

function subscribeTheme(callback: () => void) {
  const sync = () => { document.documentElement.setAttribute("data-theme", readTheme()); callback(); };
  window.addEventListener("moa-theme", callback);
  window.addEventListener("storage", sync);
  return () => { window.removeEventListener("moa-theme", callback); window.removeEventListener("storage", sync); };
}
function readTheme() {
  try { return localStorage.getItem("moa:theme") ?? "system"; } catch { return document.documentElement.getAttribute("data-theme") ?? "system"; }
}

export function AccountMenu({ user, signOutAction, showName = false }: {
  user: { id: string; name?: string | null; image?: string | null };
  signOutAction: () => Promise<void>;
  showName?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => "system");
  function changeTheme(value: string) {
    document.documentElement.setAttribute("data-theme", value);
    try { localStorage.setItem("moa:theme", value); } catch { /* 저장이 막혀도 현재 화면에는 선택을 적용한다. */ }
    window.dispatchEvent(new Event("moa-theme"));
  }
  return <>
    <button type="button" aria-label="내 계정" aria-haspopup="dialog" className={styles.account} onClick={() => dialog.current?.showModal()}><Avatar name={user.name} image={user.image} seed={user.id} size={30} />{showName && <span className="min-w-0 truncate text-xs font-semibold">{user.name ?? "나"}</span>}</button>
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="account-title" onClick={event => { if (event.target === event.currentTarget) { const rect=event.currentTarget.getBoundingClientRect(); if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom) dialog.current?.close(); } }}>
      <div className={styles.dialogHeader}><h2 id="account-title">내 계정</h2><button type="button" className={styles.close} aria-label="닫기" onClick={() => dialog.current?.close()}><X size={18} /></button></div>
      <div className="flex items-center gap-3"><Avatar name={user.name} image={user.image} seed={user.id} size={40} /><div className="min-w-0"><p className="truncate text-base font-semibold">{user.name ?? "나"}</p><p className="mt-1 text-xs text-ink-2">나의 작업 공간</p></div></div>
      <fieldset className="mt-6"><legend className="mb-2 text-xs text-ink-2">화면 모드</legend><div className="grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1">{([["system", "시스템"], ["light", "라이트"], ["dark", "다크"]] as const).map(([value, label]) => <button type="button" key={value} aria-pressed={theme === value} onClick={() => changeTheme(value)} className={`min-h-10 rounded-lg text-xs ${theme === value ? "bg-surface text-ink shadow-sm" : "text-ink-2"}`}>{label}</button>)}</div></fieldset>
      <form action={signOutAction}><button type="submit" className="mt-6 min-h-11 w-full rounded-xl bg-surface-2 text-sm text-ink">로그아웃</button></form>
    </dialog>
  </>;
}
