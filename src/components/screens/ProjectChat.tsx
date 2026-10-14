"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Copy, Flag } from "lucide-react";
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
  // 길게 누르기 메뉴(재디자인) — 앱(WebView)에서 길게 누르면 글자 선택이 먼저 떠서, 메뉴에 '복사'를 꼭 둔다.
  const [menuFor, setMenuFor] = useState<Message | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const endRef = useRef<HTMLLIElement>(null);
  function startPress(row: Message) {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => setMenuFor(row), 450);
  }
  function cancelPress() {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  }
  // 첫 화면(최근 대화)에서는 가장 아래(최신)부터 보이게.
  useEffect(() => {
    if (page === 1) endRef.current?.scrollIntoView({ block: "end" });
  }, [page, rows.length]);
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

  const nameOf = (id: string | null) => members.find((member) => member.id === id)?.name ?? "멤버";
  const when = (iso: string | Date) =>
    new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" });
  const sorted = [...rows].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  // 재디자인(2026-10-14): 상자에 갇힌 대화(최대 높이 50vh) 대신 화면을 끝까지 쓰고, 입력칸은 아래에 붙는다.
  // 내 말풍선은 프로젝트 색, 남의 말풍선은 흰 면. 이슈로 담기는 넓은 화면에선 말풍선 옆 버튼, 휴대폰에선 길게 누르기.
  return <section aria-label="프로젝트 대화" className="flex flex-col gap-3">
    {page * 30 < total && <Link className="self-center rounded-full bg-surface px-3 py-1.5 text-xs font-bold text-ink-2" href={`/s/${spaceId}?tab=chat&page=${page + 1}`}>이전 대화 보기</Link>}
    <ol aria-label="프로젝트 메시지" className="flex min-h-[calc(100dvh-26rem)] flex-col justify-end gap-1.5 md:min-h-[calc(100dvh-24rem)]">
      {sorted.map((row, index) => {
        const mine = row.createdBy === userId;
        const showName = !mine && (index === 0 || sorted[index - 1].createdBy !== row.createdBy);
        return <li key={row.id} className={`group flex max-w-[85%] flex-col gap-1 ${mine ? "self-end items-end" : "self-start items-start"}`}>
          {showName && <span className="mt-2 px-1 text-xs font-semibold text-ink-3">{nameOf(row.createdBy)}</span>}
          <div className="flex items-end gap-1.5">
            {mine && <span className="pb-1 text-[11px] text-ink-3">{when(row.createdAt)}</span>}
            <p
              onPointerDown={() => startPress(row)} onPointerUp={cancelPress} onPointerLeave={cancelPress} onPointerCancel={cancelPress}
              onContextMenu={(event) => { event.preventDefault(); setMenuFor(row); }}
              className={`whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-[15px] leading-relaxed select-none md:select-text ${mine ? "rounded-br-md bg-accent text-on-accent" : "rounded-bl-md bg-surface text-ink"}`}>
              {row.body}
            </p>
            {!mine && <span className="pb-1 text-[11px] text-ink-3">{when(row.createdAt)}</span>}
            {!row.issueId && (
              <button type="button" disabled={capturing !== null} onClick={() => void capture(row.id)}
                title="이슈로 담기" aria-label="이 메시지를 이슈로 담기"
                className="mb-0.5 hidden size-8 flex-none place-items-center rounded-full text-ink-3 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:bg-surface hover:text-accent disabled:opacity-40 md:grid">
                <Flag className="size-4" />
              </button>
            )}
          </div>
          {row.issueId && (
            <Link href={`/s/${spaceId}?tab=issues&status=${row.issueStatus ?? "raw"}#issue-${row.issueId}`}
              className="flex items-center gap-2 rounded-xl bg-warn-soft px-3 py-1.5 text-xs font-bold text-warn">
              <Flag className="size-3.5" />{row.issueStatus === "raw" ? "미가공 이슈로 담김 · 이슈 탭에서 정리" : "이슈로 정리됨 · 보기"}
            </Link>
          )}
        </li>;
      })}
      {!rows.length && <li className="rounded-2xl bg-surface px-4 py-8 text-center text-sm text-ink-3">첫 메시지를 남겨 보세요.<br />정리하지 않아도 괜찮아요. 필요한 말은 나중에 이슈로 담을 수 있어요.</li>}
      <li ref={endRef} aria-hidden="true" />
    </ol>
    {page > 1 && <Link className="self-center rounded-full bg-surface px-3 py-1.5 text-xs font-bold text-ink-2" href={`/s/${spaceId}?tab=chat&page=${page - 1}`}>최근 대화로</Link>}

    {message && <p role={failed ? "alert" : "status"} className={`rounded-xl px-3 py-2 text-sm font-semibold ${failed ? "bg-danger-soft text-danger" : "bg-ok-soft text-ok"}`}>{message}</p>}

    <form onSubmit={event => { event.preventDefault(); void send(); }}
      className="sticky bottom-[calc(var(--safe-bottom)+68px)] z-10 flex items-end gap-2 rounded-3xl bg-surface p-2 shadow-float md:bottom-4">
      <label htmlFor="project-message" className="sr-only">메시지</label>
      <textarea ref={input} id="project-message" value={body} readOnly={pending} maxLength={10000} rows={1}
        onChange={event => setBody(event.target.value)}
        onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}
        onKeyDown={event => {
          if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !event.nativeEvent.isComposing && event.keyCode !== 229 && !composing.current) { event.preventDefault(); void send(); }
        }}
        placeholder="메시지 보내기"
        className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-base text-ink placeholder:text-ink-3 focus:outline-none [field-sizing:content]" />
      <button disabled={pending || !body.trim()} aria-label={pending ? "전송 중" : "전송"}
        className="press grid size-10 flex-none place-items-center rounded-2xl bg-accent text-on-accent disabled:opacity-40">
        <ArrowUp className="size-5" />
      </button>
    </form>
    <p className="hidden px-2 text-xs text-ink-3 md:block">Enter 줄바꿈 · Ctrl/⌘ + Enter 전송</p>

    {menuFor && <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="메시지 메뉴">
      <button type="button" aria-label="닫기" className="absolute inset-0 bg-ink/40" onClick={() => setMenuFor(null)} />
      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2 rounded-t-3xl bg-surface px-4 pt-3 shadow-float md:inset-x-auto md:right-6 md:bottom-6 md:w-80 md:rounded-3xl"
        style={{ paddingBottom: "calc(var(--safe-bottom) + 16px)" }}>
        <div className="mx-auto h-1 w-10 rounded-full bg-line md:hidden" />
        <p className="line-clamp-2 px-1 text-xs text-ink-3">{nameOf(menuFor.createdBy)} · {menuFor.body}</p>
        <button type="button" className="press flex h-12 items-center gap-3 rounded-2xl bg-surface-2 px-4 text-sm font-bold text-ink"
          onClick={() => { void navigator.clipboard?.writeText(menuFor.body).catch(() => {}); setMessage("복사했어요."); setFailed(false); setMenuFor(null); }}>
          <Copy className="size-4" />복사
        </button>
        {!menuFor.issueId && <button type="button" disabled={capturing !== null} className="press flex h-12 items-center gap-3 rounded-2xl bg-accent-soft px-4 text-left text-sm font-bold text-accent"
          onClick={() => { const id = menuFor.id; setMenuFor(null); void capture(id); }}>
          <Flag className="size-4" /><span>이슈로 담기<span className="block text-xs font-medium opacity-80">미가공으로 담고, 이슈 탭에서 정리해요</span></span>
        </button>}
      </div>
    </div>}
  </section>;
}
