"use client";

import { useEffect, useState, useTransition } from "react";
import { RotateCcw, X } from "lucide-react";

import { getRevisionContent, listRevisions, restoreRevision } from "@/lib/actions/revisions";
import { sectionsFromDoc, summarizeChange } from "@/lib/revision-summary";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { relativeTime } from "@/lib/utils";

type Revision = Awaited<ReturnType<typeof listRevisions>>[number];

/**
 * S-06 변경 이력.
 *
 * 편집 화면 안에서 연다. 별도 페이지로 빼면 "돌아와서 계속 쓴다"는 흐름이 끊긴다.
 *
 * 미리보기는 본문을 그대로 렌더하지 않고 구획 단위로 보여 주면서
 * **지금과 다른 구획만 표시**한다. 되돌리면 무엇이 바뀌는지가 실제로 궁금한 것이고,
 * 문서 전문을 다시 읽게 하면 아무도 안 읽는다.
 */
export function HistoryPanel({
  noteId,
  currentDoc,
  onRestore,
  onClose,
}: {
  noteId: string;
  currentDoc: unknown;
  onRestore: (content: unknown) => void;
  onClose: () => void;
}) {
  const [revisions, setRevisions] = useState<Revision[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState<unknown>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    void listRevisions(noteId).then((rows) => {
      setRevisions(rows);
      if (rows.length > 0) setSelected(rows[0].id);
    });
  }, [noteId]);

  useEffect(() => {
    if (!selected) return;
    void getRevisionContent(noteId, selected).then((row) => setPreview(row.content));
  }, [noteId, selected]);

  const hasPreview = preview != null;
  const current = sectionsFromDoc(currentDoc);
  const past = hasPreview ? sectionsFromDoc(preview) : [];
  const identical = hasPreview && summarizeChange(past, current) === null;

  const changed = new Set(
    past
      .filter((s) => current.find((c) => c.heading === s.heading)?.text !== s.text)
      .map((s) => s.heading),
  );

  return (
    <aside className="flex w-full flex-none flex-col border-t border-line bg-surface lg:w-[26rem] lg:border-t-0 lg:border-l">
      <header className="flex flex-none items-center gap-2 border-b border-line px-4 py-2">
        <h2 className="font-serif text-sm font-semibold text-ink">변경 이력</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="이력 닫기"
          className="ml-auto rounded p-1 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <X className="size-3.5" />
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* 목록 */}
        <ul className="flex-none divide-y divide-line overflow-y-auto border-b border-line lg:w-40 lg:border-b-0 lg:border-r">
          {revisions === null && (
            <li className="px-3 py-3 font-mono text-[10px] text-ink-3">불러오는 중…</li>
          )}
          {revisions?.length === 0 && (
            <li className="px-3 py-4 text-xs leading-relaxed text-ink-3">
              아직 기록이 없습니다. 편집이 멎으면 한 줄씩 쌓입니다.
            </li>
          )}
          {revisions?.map((rev) => (
            <li key={rev.id}>
              <button
                type="button"
                onClick={() => setSelected(rev.id)}
                className={`flex w-full flex-col items-start gap-1 px-3 py-2.5 text-left transition-colors ${
                  selected === rev.id ? "bg-accent-soft" : "hover:bg-surface-2"
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <Avatar
                    name={rev.actorName}
                    image={rev.actorImage}
                    seed={rev.actorId ?? rev.id}
                    size={15}
                  />
                  <span className="truncate text-xs text-ink">{rev.actorName ?? "알 수 없음"}</span>
                </span>
                <span className="font-mono text-[10px] text-ink-3">
                  {relativeTime(rev.createdAt)}
                </span>
                <span className="text-[11px] leading-snug text-ink-2">{rev.summary}</span>
                {rev.isRevert && <Badge tone="info">되돌림</Badge>}
              </button>
            </li>
          ))}
        </ul>

        {/* 미리보기 */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            {!hasPreview && (
              <p className="text-xs text-ink-3">왼쪽에서 시점을 고르세요.</p>
            )}
            {hasPreview && (
              <>
                <p className="mb-3 text-[11px] leading-relaxed text-ink-3">
                  {identical
                    ? "지금 내용과 같습니다."
                    : `지금과 다른 곳 ${changed.size}군데. 되돌리면 아래 내용이 됩니다.`}
                </p>
                {past.map((section) => (
                  <section
                    key={section.heading}
                    className={`mb-3 border-l-2 pl-2.5 ${
                      changed.has(section.heading) ? "border-accent" : "border-line"
                    }`}
                  >
                    <h3 className="font-mono text-[10px] uppercase tracking-[0.07em] text-ink-3">
                      {section.heading}
                      {changed.has(section.heading) && (
                        <span className="ml-1.5 text-accent">달라짐</span>
                      )}
                    </h3>
                    <p className="mt-0.5 text-xs leading-relaxed whitespace-pre-wrap text-ink-2">
                      {section.text || "—"}
                    </p>
                  </section>
                ))}
              </>
            )}
          </div>

          {hasPreview && (
            <div className="flex-none border-t border-line px-4 py-2.5">
              <button
                type="button"
                disabled={pending || identical}
                onClick={() =>
                  startTransition(async () => {
                    const content = await restoreRevision(noteId, selected!);
                    onRestore(content);
                    setRevisions(await listRevisions(noteId));
                  })
                }
                className="flex w-full items-center justify-center gap-1.5 rounded bg-accent px-3 py-2 text-xs text-on-accent transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                <RotateCcw className="size-3" />
                이 시점으로 되돌리기
              </button>
              {/* 되돌린 것도 이력에 남으므로 다시 되돌릴 수 있다. 그래야 마음 놓고 누른다. */}
              <p className="mt-1.5 text-center text-[10px] text-ink-3">
                되돌린 기록도 이력에 남습니다
              </p>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
