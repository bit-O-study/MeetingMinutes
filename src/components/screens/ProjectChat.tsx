"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Copy, Flag, MoreHorizontal, Trash2 } from "lucide-react";
import Link from "@/components/PendingLink";
import { useRouter } from "next/navigation";
import { sendProjectMessage, captureMessageIssue, deleteProjectMessage } from "@/lib/actions/project-chat";
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
  const [deleting, setDeleting] = useState(false);
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const deleteLock = useRef(false);
  // 성공은 잠깐만 알리고, 실패는 사용자가 재시도할 때까지 남긴다.
  useEffect(() => {
    if (!message || failed || pending || capturing || deleting) return;
    const timer = setTimeout(() => setMessage(""), 3000);
    return () => clearTimeout(timer);
  }, [message, failed, pending, capturing, deleting]);
  // 길게 누르기 메뉴(재디자인) — 앱(WebView)에서 길게 누르면 글자 선택이 먼저 떠서, 메뉴에 '복사'를 꼭 둔다.
  const [menuFor, setMenuFor] = useState<Message | null>(null);
  const menuDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (menuFor) menuDialog.current?.showModal();
    else menuDialog.current?.close();
  }, [menuFor]);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messageList = useRef<HTMLOListElement>(null);
  const followLatest = useRef(true);
  function startPress(row: Message) {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => setMenuFor(row), 450);
  }
  function cancelPress() {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  }
  // 대화 목록만 스크롤한다. scrollIntoView는 페이지까지 끌어올려 상단 메뉴를 가렸다.
  useEffect(() => {
    const list = messageList.current;
    if (page === 1 && list && followLatest.current) list.scrollTop = list.scrollHeight;
  }, [page, rows.length]);
  const captureLock = useRef(false);
  useEffect(() => {
    const timer = setInterval(() => { if (!document.hidden && !composing.current && !sending.current) router.refresh(); }, 10000);
    return () => clearInterval(timer);
  }, [router]);
  async function capture(messageId: string) {
    if (captureLock.current || deleteLock.current) return;
    if (!window.confirm("후속 작업이나 결정이 필요한 대화인가요? 검토함에 후보로 담습니다. 이미 담은 내용인지 먼저 확인해 주세요.")) return;
    captureLock.current = true;
    setCapturing(messageId);
    try {
      const result = await captureMessageIssue({ spaceId, messageId });
      setMessage(result.message); setFailed(!result.ok);
      if (result.ok) router.refresh();
    } catch { setMessage("이슈에 담지 못했습니다. 다시 눌러 주세요."); setFailed(true); }
    finally { setCapturing(null); captureLock.current = false; }
  }

  async function remove(row: Message) {
    if (deleteLock.current || captureLock.current || row.createdBy !== userId) return;
    if (!window.confirm("이 메시지를 삭제할까요? 되돌릴 수 없습니다. 이미 담은 이슈와 원문 사본은 유지됩니다.")) return;
    deleteLock.current = true;
    setDeleting(true); setMenuFor(null); setMessage("");
    try {
      const result = await deleteProjectMessage({ spaceId, messageId: row.id });
      setMessage(result.message); setFailed(!result.ok);
      if (result.ok) {
        setRemovedIds(ids => [...ids, row.id]);
        if (page > 1 && rows.filter(item => !removedIds.includes(item.id)).length === 1) router.replace(`/s/${spaceId}?tab=chat&page=${page - 1}`);
        router.refresh();
        input.current?.focus({ preventScroll: true });
      }
    } catch { setMessage("삭제하지 못했습니다. 메시지를 확인하고 다시 시도해 주세요."); setFailed(true); }
    finally { setDeleting(false); deleteLock.current = false; }
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
      if (result.ok) { followLatest.current = true; setBody(""); request.current = null; router.replace(`/s/${spaceId}?tab=chat`); router.refresh(); }
    } catch {
      setFailed(true);
      setMessage("전송하지 못했습니다. 입력 내용은 그대로 남아 있습니다. 다시 전송해 주세요.");
    } finally {
      sending.current = false;
      setPending(false);
      input.current?.focus({ preventScroll: true });
    }
  }

  const nameOf = (id: string | null) => members.find((member) => member.id === id)?.name ?? "멤버";
  const when = (iso: string | Date) =>
    new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" });
  const sorted = rows.filter(row => !removedIds.includes(row.id)).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  // 재디자인(2026-10-14): 상자에 갇힌 대화(최대 높이 50vh) 대신 화면을 끝까지 쓰고, 입력칸은 아래에 붙는다.
  // 모든 화면에서 같은 메시지 메뉴를 제공해 작은 화면에서도 작업을 찾을 수 있게 한다.
  return <section aria-label="프로젝트 대화" className="flex flex-col gap-3">
    {page * 30 < total && <Link className="self-center rounded-full bg-surface px-3 py-1.5 text-xs font-bold text-ink-2" href={`/s/${spaceId}?tab=chat&page=${page + 1}`}>이전 대화 보기</Link>}
    <ol ref={messageList} tabIndex={0} aria-label="프로젝트 메시지" className="chat-messages" onScroll={event => { const list = event.currentTarget; followLatest.current = list.scrollHeight - list.scrollTop - list.clientHeight < 80; }}>
      {sorted.map((row, index) => {
        const mine = row.createdBy === userId;
        const showName = !mine && (index === 0 || sorted[index - 1].createdBy !== row.createdBy);
        return <li key={row.id} className={`group flex min-w-0 max-w-[92%] flex-col gap-1 ${mine ? "self-end items-end" : "self-start items-start"}`}>
          {showName && <span className="mt-2 px-1 text-xs font-semibold text-ink-3">{nameOf(row.createdBy)}</span>}
          <div className="flex items-end gap-1.5">
            {mine && <span className="pb-1 text-[11px] text-ink-3">{when(row.createdAt)}</span>}
            <p
              onPointerDown={() => startPress(row)} onPointerUp={cancelPress} onPointerLeave={cancelPress} onPointerCancel={cancelPress}
              onContextMenu={(event) => { event.preventDefault(); setMenuFor(row); }}
              className={`min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere] rounded-2xl px-3.5 py-2.5 text-[15px] leading-relaxed select-none md:select-text ${mine ? "rounded-br-md bg-accent text-on-accent" : "rounded-bl-md bg-surface text-ink"}`}>
              {row.body}
            </p>
            {!mine && <span className="pb-1 text-[11px] text-ink-3">{when(row.createdAt)}</span>}
              <button type="button" disabled={deleting} onClick={() => setMenuFor(row)}
                title="메시지 메뉴" aria-label="메시지 메뉴" aria-haspopup="dialog"
                className="mb-0.5 grid size-9 flex-none place-items-center rounded-full text-ink-3 hover:bg-surface hover:text-accent">
                <MoreHorizontal className="size-4" />
              </button>
          </div>
          {row.issueId && (
            <Link href={`/s/${spaceId}?tab=issues&issue=${row.issueId}#issue-${row.issueId}`}
              className="flex items-center gap-2 px-2 py-1 text-xs text-ink-3 hover:text-accent">
              <Flag className="size-3.5" />{row.issueStatus === "raw" ? "검토함에 담김 · 검토하기" : "연결된 이슈 보기"}
            </Link>
          )}
        </li>;
      })}
      {!sorted.length && <li className="rounded-2xl bg-surface px-4 py-8 text-center text-sm text-ink-3">첫 메시지를 남겨 보세요.<br />정리하지 않아도 괜찮아요. 필요한 말은 나중에 이슈로 담을 수 있어요.</li>}
    </ol>
    {page > 1 && <Link className="self-center rounded-full bg-surface px-3 py-1.5 text-xs font-bold text-ink-2" href={`/s/${spaceId}?tab=chat&page=${page - 1}`}>최근 대화로</Link>}

    {(message || pending || capturing || deleting || body.trim()) && <p data-testid="chat-feedback" role={failed ? "alert" : "status"} className={`px-3 text-xs leading-relaxed ${failed ? "text-danger" : "text-ink-3"}`}>{deleting ? "삭제 중…" : pending ? "보내는 중…" : capturing ? "이슈에 담는 중…" : message || "작성 중…"}</p>}

    <form onSubmit={event => { event.preventDefault(); void send(); }}
      className="chat-composer flex items-end gap-2 p-2">
      <label htmlFor="project-message" className="sr-only">메시지</label>
      <textarea ref={input} id="project-message" value={body} readOnly={pending} maxLength={10000} rows={1}
        onChange={event => { setBody(event.target.value); if (!failed) setMessage(""); }}
        onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}
        onKeyDown={event => {
          if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !event.nativeEvent.isComposing && event.keyCode !== 229 && !composing.current) { event.preventDefault(); void send(); }
        }}
        placeholder="메시지 보내기"
        className="max-h-40 min-h-10 min-w-0 flex-1 resize-none bg-transparent px-2 py-2 text-base text-ink placeholder:text-ink-3 focus:outline-none [field-sizing:content]" />
      <button disabled={pending || !body.trim()} aria-label={pending ? "전송 중" : "전송"}
        className="press grid size-10 flex-none place-items-center rounded-2xl bg-accent text-on-accent disabled:opacity-40">
        <ArrowUp className="size-5" />
      </button>
    </form>
    <p className="hidden px-2 text-xs text-ink-3 md:block">Enter 줄바꿈 · Ctrl/⌘ + Enter 전송</p>

    <dialog ref={menuDialog} onCancel={() => setMenuFor(null)} onClose={() => setMenuFor(null)} aria-label="메시지 메뉴" className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-2xl bg-surface p-4 text-ink shadow-float backdrop:bg-ink/40">
      {menuFor && <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">메시지 메뉴</h2><button type="button" className="min-h-10 px-3 text-sm text-ink-2" onClick={() => setMenuFor(null)}>닫기</button></div>
        <p className="line-clamp-2 px-1 text-xs text-ink-3">{nameOf(menuFor.createdBy)} · {menuFor.body}</p>
        <button type="button" className="press flex h-12 items-center gap-3 rounded-2xl bg-surface-2 px-4 text-sm font-bold text-ink"
          onClick={async () => { try { await navigator.clipboard.writeText(menuFor.body); setMessage("복사했어요."); setFailed(false); } catch { setMessage("복사하지 못했습니다. 다시 시도해 주세요."); setFailed(true); } setMenuFor(null); }}>
          <Copy className="size-4" />복사
        </button>
        {!menuFor.issueId && <button type="button" disabled={capturing !== null} className="press flex h-12 items-center gap-3 rounded-2xl bg-accent-soft px-4 text-left text-sm font-bold text-accent"
          onClick={() => { const id = menuFor.id; setMenuFor(null); void capture(id); }}>
          <Flag className="size-4" /><span>검토함에 담기<span className="block text-xs font-medium opacity-80">후속 작업이 필요한 대화만 담아 주세요</span></span>
        </button>}
        {menuFor.createdBy === userId && <button type="button" disabled={deleting || capturing !== null} onClick={() => void remove(menuFor)} className="press flex min-h-12 items-center gap-3 rounded-2xl bg-danger-soft px-4 text-sm font-bold text-danger disabled:opacity-45"><Trash2 className="size-4" />메시지 삭제</button>}
      </div>}
    </dialog>
  </section>;
}
