"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import type { Transaction } from "@tiptap/pm/state";
import { ImagePlus } from "lucide-react";
import { noteImageUrl } from "@/lib/note-image";

export function PhotoUpload({ editor, noteId }: { editor: Editor | null; noteId: string }) {
  const input = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const upload = useCallback(async (file: File, position?: number) => {
    if (!editor || editor.isDestroyed || busy.current) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setError("사진은 5MB 이하의 JPG, PNG, WebP 파일을 선택하세요.");
      return;
    }
    busy.current = true;
    setUploading(true); setError("");
    // 업로드 중 내 입력·다른 사람의 편집이 일어나도 원래 삽입 위치를 따라간다.
    let at = position ?? editor.state.selection.from;
    const mapPosition = ({ transaction }: { transaction: Transaction }) => { at = transaction.mapping.map(at); };
    editor.on("transaction", mapPosition);
    try {
      const permission = await fetch(`/api/notes/${noteId}/attachments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: file.name, size: file.size }) });
      const ticket = await permission.json();
      if (!permission.ok) throw new Error(ticket.error || "사진 저장소에 연결하지 못했습니다.");
      const response = await fetch(ticket.url, { method: "PUT", headers: { Authorization: "Bearer " + ticket.token, "Content-Type": "application/octet-stream" }, body: file });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "사진을 올리지 못했습니다.");
      const src = noteImageUrl(result.url);
      if (!src) throw new Error("사진 주소를 확인하지 못했습니다.");
      if (!editor.isDestroyed) editor.chain().focus().insertContentAt(at, { type: "image", attrs: { src, alt: file.name } }).run();
    } catch (err) {
      setError(err instanceof Error ? err.message : "사진을 올리지 못했습니다. 다시 시도하세요.");
    } finally {
      editor.off("transaction", mapPosition);
      busy.current = false; setUploading(false);
    }
  }, [editor, noteId]);

  useEffect(() => {
    if (!editor) return;
    const paste = (event: ClipboardEvent) => {
      const file = [...(event.clipboardData?.files ?? [])].find((item) => item.type.startsWith("image/"));
      if (!file) return;
      event.preventDefault(); event.stopPropagation(); void upload(file);
    };
    const drop = (event: DragEvent) => {
      const file = [...(event.dataTransfer?.files ?? [])].find((item) => item.type.startsWith("image/"));
      if (!file) return;
      event.preventDefault(); event.stopPropagation();
      const pos = editor.view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
      void upload(file, pos);
    };
    const dom = editor.view.dom;
    dom.addEventListener("paste", paste, true); dom.addEventListener("drop", drop, true);
    return () => { dom.removeEventListener("paste", paste, true); dom.removeEventListener("drop", drop, true); };
  }, [editor, upload]);

  return <div className="flex flex-wrap items-center gap-2">
    <input ref={input} type="file" className="hidden" accept="image/jpeg,image/png,image/webp" aria-label="노트 사진 선택" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void upload(file); }} />
    <button type="button" disabled={!editor || uploading} onClick={() => input.current?.click()} className="inline-flex h-8 items-center gap-1.5 rounded-xl px-2.5 text-xs font-bold text-ink-3 hover:bg-surface-2 disabled:opacity-50">
      <ImagePlus className="size-3" />{uploading ? "사진 올리는 중…" : "사진"}
    </button>
    {error && <span role="alert" className="text-xs text-danger">{error}</span>}
  </div>;
}
