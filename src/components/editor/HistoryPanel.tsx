"use client";

import { useEffect, useState, useTransition } from "react";
import { RefreshCw, RotateCcw, X } from "lucide-react";
import { getRevisionContent, listRevisions, restoreRevision } from "@/lib/actions/revisions";
import { sectionsFromDoc, summarizeChange } from "@/lib/revision-summary";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { ReadOnlyNote } from "@/components/ReadOnlyNote";
import { relativeTime } from "@/lib/utils";

type Revision = Awaited<ReturnType<typeof listRevisions>>[number];

export function HistoryPanel({ noteId, currentDoc, onRestore, onClose }: {
  noteId: string; currentDoc: unknown; onRestore: (content: unknown) => void; onClose: () => void;
}) {
  const [revisions, setRevisions] = useState<Revision[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ id: string; content: unknown } | null>(null);
  const [listError, setListError] = useState("");
  const [previewError, setPreviewError] = useState<{ id: string; message: string } | null>(null);
  const [restoreError, setRestoreError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const rows = await listRevisions(noteId);
        if (!alive) return;
        setRevisions(rows);
        setListError("");
        setSelected((id) => id ?? rows[0]?.id ?? null);
      } catch { if (alive) setListError("이력을 불러오지 못했습니다."); }
      // 편집이 멎은 뒤 만들어지는 이력도 패널을 다시 열지 않고 확인한다.
      if (alive) timer = setTimeout(() => { if (!document.hidden) void refresh(); else timer = setTimeout(refresh, 5000); }, 5000);
    }
    void refresh();
    return () => { alive = false; clearTimeout(timer); };
  }, [noteId, attempt]);

  useEffect(() => {
    if (!selected) return;
    let alive = true;
    getRevisionContent(noteId, selected).then(
      (row) => { if (alive) { setPreview({ id: selected, content: row.content }); setPreviewError(null); } },
      () => { if (alive) setPreviewError({ id: selected, message: "이 시점의 내용을 불러오지 못했습니다." }); },
    );
    return () => { alive = false; };
  }, [noteId, selected, attempt]);

  // 선택한 시점과 일치하는 결과만 보여 준다. 늦게 온 이전 요청으로 복원하지 않는다.
  const hasPreview = preview !== null && preview.id === selected;
  const selectedError = previewError?.id === selected ? previewError.message : "";
  const identical = hasPreview && summarizeChange(sectionsFromDoc(preview.content), sectionsFromDoc(currentDoc)) === null;
  const selectedRow = revisions?.find((row) => row.id === selected);
  const retry = () => { setPreviewError(null); setRestoreError(""); setAttempt((n) => n + 1); };

  return <aside aria-label="변경 이력" className="flex h-[calc(100dvh-20rem-var(--safe-bottom))] min-h-60 w-full flex-col border-t border-line bg-surface lg:h-auto lg:min-h-0 lg:w-[26rem] lg:flex-none lg:border-t-0 lg:border-l">
    <header className="flex shrink-0 items-center gap-2 border-b border-line px-4 py-3">
      <h2 className="text-sm font-bold text-ink">변경 이력</h2>
      <span className="text-xs text-ink-3">{revisions ? `${revisions.length}개` : ""}</span>
      <button type="button" onClick={retry} aria-label="이력 새로고침" className="ml-auto grid size-8 place-items-center rounded-xl text-ink-3 hover:bg-surface-2"><RefreshCw className="size-3.5" /></button>
      <button type="button" onClick={onClose} aria-label="이력 닫기" className="grid size-8 place-items-center rounded-xl text-ink-3 hover:bg-surface-2"><X className="size-4" /></button>
    </header>
    {listError && <div role="alert" className="flex items-center justify-between gap-2 bg-warn-soft px-4 py-2 text-xs text-warn">{listError}<button type="button" onClick={retry} className="shrink-0 font-bold">다시 시도</button></div>}
    <ul aria-label="이력 목록" className="max-h-44 shrink-0 divide-y divide-line overflow-y-auto border-b border-line">
      {revisions === null && !listError && <li role="status" className="px-4 py-4 text-xs text-ink-3">이력 불러오는 중…</li>}
      {revisions?.length === 0 && <li className="px-4 py-5 text-xs leading-relaxed text-ink-3">아직 기록이 없습니다. 입력을 멈춘 뒤 약 15초 후 이곳에 표시됩니다.</li>}
      {revisions?.map((rev) => <li key={rev.id}>
        <button type="button" disabled={pending} aria-pressed={selected === rev.id} onClick={() => { setSelected(rev.id); setRestoreError(""); }} className={`flex w-full min-w-0 flex-col gap-1.5 px-4 py-3 text-left transition-colors ${selected === rev.id ? "bg-accent-soft" : "hover:bg-surface-2"}`}>
          <span className="flex w-full min-w-0 items-center gap-2"><Avatar name={rev.actorName} image={rev.actorImage} seed={rev.actorId ?? rev.id} size={18} /><span className="min-w-0 truncate text-xs font-semibold text-ink">{rev.actorName ?? "알 수 없음"}</span><time className="ml-auto shrink-0 whitespace-nowrap text-[11px] text-ink-3" title={new Date(rev.createdAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}>{relativeTime(rev.createdAt)}</time>{rev.isRevert && <Badge tone="info">되돌림</Badge>}</span>
          <span className="break-words text-xs leading-relaxed text-ink-2">{rev.summary}</span>
        </button>
      </li>)}
    </ul>
    <div data-testid="revision-preview" className="min-h-0 flex-1 overflow-y-auto px-4 py-4 [overflow-wrap:anywhere] [&_.tiptap]:text-sm">
      {selectedError ? <div role="alert" className="text-xs text-warn">{selectedError}<button type="button" onClick={retry} className="ml-2 font-bold">다시 시도</button></div> : selected && !hasPreview ? <p role="status" className="text-xs text-ink-3">내용 불러오는 중…</p> : !selected ? <p className="text-xs text-ink-3">기록을 선택하면 그때의 글과 사진을 볼 수 있습니다.</p> : null}
      {hasPreview && !selectedError && <><p className="mb-3 text-xs leading-relaxed text-ink-3">{selectedRow?.summary} · {identical ? "지금 내용과 같습니다." : "선택한 시점의 내용입니다."}</p><ReadOnlyNote content={preview.content} /></>}
    </div>
    {restoreError && <p role="alert" className="px-4 py-2 text-xs text-danger">{restoreError}</p>}
    {selected && <footer className="shrink-0 border-t border-line px-4 py-3">
      <button type="button" disabled={pending || !hasPreview || !!selectedError || identical} onClick={() => startTransition(async () => {
        try { const content = await restoreRevision(noteId, selected); onRestore(content); }
        catch { setRestoreError("되돌리지 못했습니다. 연결을 확인하고 다시 시도하세요."); }
      })} className="flex h-10 w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-accent text-xs font-semibold text-on-accent disabled:opacity-40"><RotateCcw className="size-3.5" />{pending ? "되돌리는 중…" : "이 시점으로 되돌리기"}</button>
      <p className="mt-2 text-center text-[11px] text-ink-3">되돌린 기록도 이력에 남습니다.</p>
    </footer>}
  </aside>;
}
