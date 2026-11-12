"use client";

import { useRef } from "react";
import { X } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import styles from "./Navigation.module.css";

export function AccountMenu({ user, signOutAction }: {
  user: { id: string; name?: string | null; image?: string | null };
  signOutAction: () => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  return <>
    <button type="button" aria-label="내 계정" aria-haspopup="dialog" className={styles.account} onClick={() => dialog.current?.showModal()}><Avatar name={user.name} image={user.image} seed={user.id} size={30} /></button>
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="account-title" onClick={event => { if (event.target === event.currentTarget) { const rect=event.currentTarget.getBoundingClientRect(); if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom) dialog.current?.close(); } }}>
      <div className={styles.dialogHeader}><h2 id="account-title">내 계정</h2><button type="button" className={styles.close} aria-label="닫기" onClick={() => dialog.current?.close()}><X size={18} /></button></div>
      <div className="flex items-center gap-3"><Avatar name={user.name} image={user.image} seed={user.id} size={40} /><div className="min-w-0"><p className="truncate text-base font-semibold">{user.name ?? "나"}</p><p className="mt-1 text-xs text-ink-2">화면 밝기는 기기 설정을 따라요</p></div></div>
      <form action={signOutAction}><button type="submit" className="mt-6 min-h-11 w-full rounded-xl bg-surface-2 text-sm text-ink">로그아웃</button></form>
    </dialog>
  </>;
}
