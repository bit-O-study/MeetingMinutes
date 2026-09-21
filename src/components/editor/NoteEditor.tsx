"use client";

import { useEffect, useRef } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";

import { saveNoteContent } from "@/lib/actions/notes";
import { useCollab, type CollabUser } from "@/lib/collab/useCollab";
import { ConnectionBadge } from "@/components/editor/ConnectionBadge";
import { AvatarStack } from "@/components/ui/Avatar";

/** 입력이 잠잠해지면 Tiptap JSON 사본을 저장한다. 진실의 원천은 Yjs 상태다. */
const SAVE_DEBOUNCE_MS = 1500;

export function NoteEditor({
  noteId,
  me,
  initialContent,
}: {
  noteId: string;
  me: CollabUser;
  initialContent: unknown;
}) {
  const { doc, provider, status, syncedAt, peers } = useCollab(noteId, me);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seeded = useRef(false);

  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions: [
        // Yjs가 되돌리기를 담당하므로 Tiptap 자체 히스토리는 끈다.
        StarterKit.configure({ undoRedo: false }),
        TaskList,
        TaskItem.configure({ nested: false }),
        Placeholder.configure({ placeholder: "여기에 적으세요" }),
        Collaboration.configure({ document: doc }),
        ...(provider
          ? [CollaborationCaret.configure({ provider, user: { name: me.name, color: me.color } })]
          : []),
      ],
      editorProps: {
        attributes: { class: "tiptap min-h-[60vh] px-1 py-2 text-[15px] text-ink" },
      },
      onUpdate({ editor }) {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
          void saveNoteContent(noteId, editor.getJSON());
        }, SAVE_DEBOUNCE_MS);
      },
    },
    [provider, doc],
  );

  /**
   * 빈 Yjs 문서에만 템플릿을 심는다.
   * 이미 내용이 있는데 심으면 다른 사람이 쓴 것과 겹친다.
   */
  useEffect(() => {
    if (!editor || seeded.current || !initialContent) return;
    if (!provider?.synced) return;
    seeded.current = true;
    if (editor.isEmpty) editor.commands.setContent(initialContent as never, { emitUpdate: false });
  }, [editor, provider?.synced, initialContent]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-line px-4 py-1.5">
        <ConnectionBadge status={status} syncedAt={syncedAt} />
        <div className="ml-auto">
          <AvatarStack people={peers.map((p) => ({ id: p.id, name: p.name, image: p.image }))} />
        </div>
      </div>
      <div className="min-w-0 flex-1 overflow-y-auto px-4 py-4">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
