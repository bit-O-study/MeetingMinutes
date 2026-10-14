"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { sendProjectMessage, captureMessageIssue } from "@/lib/actions/project-chat";
import type { listProjectMessages } from "@/lib/actions/project-chat";


type Message = Awaited<ReturnType<typeof listProjectMessages>>["rows"][number];
export function ProjectChat({ spaceId, userId, members, rows, total, page }: {
  spaceId: string; userId: string; members: { id: string; name: string | null }[]; rows: Message[]; total: number; page: number;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const sending = useRef(false);
  const request = useRef<{ id: string; body: string } | null>(null);
  const composing = useRef(false);
  const input = useRef<HTMLTextAreaElement>(null);

  const [capturing, setCapturing] = useState<string | null>(null);
  const captureLock = useRef(false);
  useEffect(() => {
    const timer = setInterval(() => { if (!document.hidden && !composing.current && !sending.current) router.refresh(); }, 10000);
    return () => clearInterval(timer);
  }, [router]);
  async function capture(messageId: string) {
    if (captureLock.current) return;
    captureLock.current = true;
    setCapturing(messageId);
    try {
      const result = await captureMessageIssue({ spaceId, messageId });
      setMessage(result.message); setFailed(!result.ok);
      if (result.ok) router.refresh();
    } catch { setMessage("이슈에 담지 못했습니다. 다시 눌러 주세요."); setFailed(true); }
    finally { setCapturing(null); captureLock.current = false; }
  }

  async function send() {
    if (sending.current || composing.current || !body.trim()) return;
    sending.current = true;
    setPending(true);
    setMessage("");
    if (!request.current || request.current.body !== body) request.current = { id: crypto.randomUUID(), body };
    try {
      const result = await sendProjectMessage({ ...request.current, spaceId });
      setMessage(result.message);
      setFailed(!result.ok);
      if (result.ok) { setBody(""); request.current = null; router.replace(`/s/${spaceId}?tab=chat`); router.refresh(); }
    } catch {
      setFailed(true);
      setMessage("전송하지 못했습니다. 입력 내용은 그대로 남아 있습니다. 다시 전송해 주세요.");
    } finally {
      sending.current = false;
      setPending(false);
      input.current?.focus();
    }
  }

  return <section aria-label="프로젝트 채팅" className="space-y-4">
    <p className="text-sm text-ink-2">프로젝트 이야기를 나누고 필요한 메시지의 ‘이슈’ 버튼을 눌러 <Link className="text-accent underline" href={`/s/${spaceId}?tab=issues&status=raw`}>미가공 이슈</Link>에 담으세요.</p>
    <ol aria-label="프로젝트 메시지" className="flex max-h-[50vh] flex-col gap-3 overflow-y-auto rounded border border-line p-3">
      {[...rows].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()).map(row => <li key={row.id} className={`max-w-[90%] rounded-xl px-4 py-3 ${row.createdBy === userId ? "self-end bg-accent-soft" : "self-start bg-surface-2"}`}>
        <p className="mb-1 text-xs text-ink-3">{members.find(member => member.id === row.createdBy)?.name ?? "멤버"} · {new Date(row.createdAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</p>
        <p className="whitespace-pre-wrap break-words text-sm text-ink">{row.body}</p>
        {row.issueId ? <Link className="mt-2 inline-block text-xs text-accent underline" href={`/s/${spaceId}?tab=issues&status=${row.issueStatus ?? "raw"}#issue-${row.issueId}`}>{row.issueStatus === "raw" ? "미가공 이슈에 담김" : "가공된 이슈 보기"}</Link>
          : <button type="button" disabled={capturing !== null} onClick={() => void capture(row.id)} className="mt-2 rounded border border-line px-3 py-1 text-xs text-accent disabled:opacity-50">{capturing === row.id ? "담는 중…" : "이슈"}</button>}
      </li>)}
      {!rows.length && <li className="py-6 text-center text-sm text-ink-3">첫 프로젝트 메시지를 남겨 보세요.</li>}
    </ol>
    <nav aria-label="채팅 페이지" className="flex gap-4 text-sm text-accent">
      {page * 30 < total && <Link href={`/s/${spaceId}?tab=chat&page=${page + 1}`}>이전 대화</Link>}
      {page > 1 && <Link href={`/s/${spaceId}?tab=chat&page=${page - 1}`}>최근 대화</Link>}
    </nav>
    <form onSubmit={event => { event.preventDefault(); void send(); }} className="space-y-2">
      <label htmlFor="project-message" className="text-sm text-ink-2">메시지</label>
      <textarea ref={input} id="project-message" value={body} readOnly={pending} maxLength={10000} rows={3}
        onChange={event => setBody(event.target.value)}
        onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}
        onKeyDown={event => {
          if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !event.nativeEvent.isComposing && event.keyCode !== 229 && !composing.current) { event.preventDefault(); void send(); }
        }}
        placeholder="정리하지 않아도 괜찮아요. 내용을 그대로 적어 주세요."
        className="w-full rounded border border-line bg-surface px-3 py-3 text-base text-ink" />
      <div className="flex items-center justify-between gap-3"><span className="text-xs text-ink-3">Enter 줄바꿈 · Ctrl/⌘ + Enter 전송</span><button disabled={pending || !body.trim()} className="rounded bg-accent px-4 py-2 text-sm text-on-accent disabled:opacity-50">{pending ? "전송 중…" : "전송"}</button></div>
      {message && <p role={failed ? "alert" : "status"} className="text-sm text-ink-2">{message}</p>}
    </form>
  </section>;
}
