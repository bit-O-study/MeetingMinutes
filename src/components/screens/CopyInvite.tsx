"use client";
import { useRef, useState } from "react";
export function CopyInvite({ id, url }: { id: string; url: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");
  async function copy() {
    setMessage("");
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(url);
      setMessage("초대 링크를 복사했습니다.");
    } catch {
      input.current?.focus(); input.current?.select();
      try { if (document.execCommand("copy")) { setMessage("초대 링크를 복사했습니다."); return; } } catch {}
      setMessage("자동 복사가 지원되지 않습니다. 선택된 주소를 길게 눌러 복사하세요.");
    }
  }
  return <div>
    <label htmlFor={id} className="mb-1 block text-xs text-ink-2">초대 주소 · 누르면 복사됩니다</label>
    <div className="flex gap-2"><input ref={input} id={id} readOnly value={url} onClick={copy} className="min-w-0 flex-1 cursor-copy rounded-2xl bg-ground px-3 py-2 text-sm text-ink ring-1 ring-inset ring-line" /><button type="button" onClick={copy} className="rounded-2xl bg-accent-soft px-4 py-2 text-sm font-bold text-accent">복사</button></div>
    <p role="status" className="mt-1 text-xs text-ink-2">{message}</p>
  </div>;
}
