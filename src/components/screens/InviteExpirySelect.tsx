"use client";

import { useState } from "react";

export function InviteForm({ action, className, children }: { action: (data: FormData) => Promise<void>; className: string; children: React.ReactNode }) {
  // 선택한 기간을 다음 발급에도 사용하므로 성공 후 브라우저의 폼 초기화를 막는다.
  return <form action={action} className={className} onReset={(event) => event.preventDefault()}>{children}</form>;
}

export function InviteExpirySelect({ id, permanent = false }: { id: string; permanent?: boolean }) {
  // 서버 액션 성공 후 폼이 초기화돼도 사용자가 선택한 기간을 유지한다.
  const [expiry, setExpiry] = useState(permanent ? "none" : "7");
  return <div className="flex items-center gap-2">
    <label htmlFor={id} className="text-xs text-ink-2">유효 기간</label>
    <select id={id} name="expiry" value={expiry} onChange={(event) => setExpiry(event.target.value)} className="rounded-2xl ring-1 ring-inset ring-line bg-surface px-2 py-2 text-sm text-ink">
      <option value="1">1일</option><option value="7">7일</option><option value="30">30일</option><option value="none">만료 없음</option>
    </select>
  </div>;
}
