"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import { ySyncPluginKey } from "y-prosemirror";
import { History, Share2 } from "lucide-react";

import { saveNoteContent } from "@/lib/actions/notes";
import { deleteTask, syncNoteTasks, toggleTaskInNote, updateTask } from "@/lib/actions/tasks";
import { useCollab, type CollabUser } from "@/lib/collab/useCollab";
import { ConnectionBadge } from "@/components/editor/ConnectionBadge";
import { HistoryPanel } from "@/components/editor/HistoryPanel";
import { SharePanel } from "@/components/editor/SharePanel";
import { TaskPanel, type Member, type TaskPatch } from "@/components/editor/TaskPanel";
import { TaskItemWithId, collectDocTasks } from "@/components/editor/TaskItemWithId";
import { AvatarStack } from "@/components/ui/Avatar";
import type { Task } from "@/lib/db/schema";

/** 입력이 잠잠해지면 저장한다. 진실의 원천은 Yjs 상태이고 이건 파생 사본이다. */
const SAVE_DEBOUNCE_MS = 1500;
/** 할 일 동기화는 조금 더 빨리. 우측 패널이 늦게 따라오면 어긋난 것처럼 보인다. */
const TASK_DEBOUNCE_MS = 600;

/**
 * DB에서 온 값을 본문에 반영할 때 붙이는 표식.
 * 이걸 보고 할 일 동기화를 건너뛴다 — 방금 DB에서 읽은 값을 그대로
 * 되돌려 쓰면 같은 값을 왕복시키게 된다. 본문 저장은 그대로 한다.
 */
const FROM_DB = "mm-from-db";

export function NoteWorkspace({
  noteId,
  me,
  initialContent,
  initialTasks,
  members,
}: {
  noteId: string;
  me: CollabUser;
  initialContent: unknown;
  initialTasks: Task[];
  members: Member[];
}) {
  const { doc, provider, status, syncedAt, peers } = useCollab(noteId, me);
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  // 우측 패널은 한 번에 하나만 뜬다. 셋을 동시에 열면 본문이 좁아진다.
  const [panel, setPanel] = useState<"tasks" | "history" | "share">("tasks");

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const taskTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seeded = useRef(false);
  const reconciled = useRef(false);

  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions: [
        // Yjs가 되돌리기를 담당하므로 Tiptap 자체 히스토리는 끈다.
        StarterKit.configure({ undoRedo: false }),
        TaskList,
        TaskItemWithId.configure({ nested: false }),
        Placeholder.configure({ placeholder: "여기에 적으세요" }),
        Collaboration.configure({ document: doc }),
        ...(provider
          ? [CollaborationCaret.configure({ provider, user: { name: me.name, color: me.color } })]
          : []),
      ],
      editorProps: {
        attributes: { class: "tiptap min-h-[60vh] px-1 py-2 text-[15px] text-ink" },
      },
      onUpdate({ editor, transaction }) {
        // 남이 친 글자까지 내가 저장하면 같은 쓰기를 접속자 수만큼 하게 된다.
        // y-prosemirror가 원격 변경에 남기는 표식으로 걸러낸다.
        const remote = transaction.getMeta(ySyncPluginKey)?.isChangeOrigin === true;
        if (remote) return;

        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
          void saveNoteContent(noteId, editor.getJSON());
        }, SAVE_DEBOUNCE_MS);

        // DB에서 밀어 넣은 변경이면 본문만 저장하고 할 일은 건드리지 않는다.
        if (transaction.getMeta(FROM_DB)) return;

        if (taskTimer.current) clearTimeout(taskTimer.current);
        taskTimer.current = setTimeout(() => {
          void syncNoteTasks(noteId, collectDocTasks(editor.state.doc)).then(setTasks);
        }, TASK_DEBOUNCE_MS);
      },
    },
    [provider, doc],
  );

  /** 빈 Yjs 문서에만 템플릿을 심는다. 내용이 있는데 심으면 남이 쓴 것과 겹친다. */
  useEffect(() => {
    if (!editor || seeded.current || !initialContent) return;
    if (!provider?.synced) return;
    seeded.current = true;
    if (editor.isEmpty) editor.commands.setContent(initialContent as never, { emitUpdate: false });
  }, [editor, provider?.synced, initialContent]);

  /**
   * 노트를 열 때 완료 여부를 DB 기준으로 한 번 맞춘다.
   *
   * 내 할 일 화면에서 체크한 것은 본문을 건드리지 못한다. 그래서 여기서
   * 따라잡지 않으면 "목록에선 완료인데 회의록에선 미완료"가 남는다.
   * 편집이 시작된 뒤로는 반대로 본문이 이긴다.
   */
  useEffect(() => {
    if (!editor || reconciled.current || !provider?.synced || !seeded.current) return;
    reconciled.current = true;

    for (const task of tasks) {
      if (!task.blockId) continue;
      setDocTaskChecked(editor, task.blockId, Boolean(task.doneAt));
    }
    // tasks는 의도적으로 제외한다 — 최초 1회만 맞춘다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, provider?.synced]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (taskTimer.current) clearTimeout(taskTimer.current);
    };
  }, []);

  /** 패널에서 체크하면 DB와 본문을 함께 바꾼다. 한쪽만 바뀌면 바로 어긋난다. */
  const handleToggle = useCallback(
    async (task: Task) => {
      const next = !task.doneAt;
      if (editor && task.blockId) setDocTaskChecked(editor, task.blockId, next);
      const rows = await toggleTaskInNote(noteId, task.id);
      setTasks(rows);
    },
    [editor, noteId],
  );

  /**
   * 담당자·기한 변경. 본문에는 적을 자리가 없어 tasks에만 있는 값이라
   * 에디터를 건드리지 않는다.
   */
  const handleUpdate = useCallback(
    async (taskId: string, patch: TaskPatch) => {
      setTasks(await updateTask(taskId, patch));
    },
    [],
  );

  /** 본문과 이어진 항목은 패널에서 삭제를 노출하지 않는다 — 다음 동기화 때 되살아난다. */
  const handleDelete = useCallback(async (taskId: string) => {
    setTasks(await deleteTask(taskId));
  }, []);

  /**
   * 되돌리기. 본문을 그 시점 내용으로 바꾸면 Yjs가 차이를 계산해
   * 접속자 모두에게 전파한다. 할 일도 본문을 따라 다시 맞춰진다.
   */
  const handleRestore = useCallback(
    (content: unknown) => {
      if (!editor || !content) return;
      editor.commands.setContent(content as never);
      setPanel("tasks");
    },
    [editor],
  );

  /** 패널의 추가 버튼은 본문 맨 끝에 체크박스를 넣는다. 존재는 본문이 정하기 때문이다. */
  const handleAdd = useCallback(() => {
    if (!editor) return;
    editor.chain().focus("end").insertContent({ type: "taskList", content: [{ type: "taskItem", attrs: { checked: false }, content: [{ type: "paragraph" }] }] }).run();
  }, [editor]);

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-line px-4 py-1.5">
          <ConnectionBadge status={status} syncedAt={syncedAt} />
          <div className="ml-auto flex items-center gap-2">
            <AvatarStack people={peers.map((p) => ({ id: p.id, name: p.name, image: p.image }))} />
            <PanelToggle
              active={panel === "history"}
              onClick={() => setPanel((p) => (p === "history" ? "tasks" : "history"))}
              icon={<History className="size-3" />}
              label="이력"
            />
            <PanelToggle
              active={panel === "share"}
              onClick={() => setPanel((p) => (p === "share" ? "tasks" : "share"))}
              icon={<Share2 className="size-3" />}
              label="공유"
            />
          </div>
        </div>
        <div className="min-w-0 flex-1 overflow-y-auto px-4 py-4">
          <EditorContent editor={editor} />
        </div>
      </div>

      {panel === "history" && (
        <HistoryPanel
          noteId={noteId}
          currentDoc={editor?.getJSON() ?? null}
          onRestore={handleRestore}
          onClose={() => setPanel("tasks")}
        />
      )}
      {panel === "share" && <SharePanel noteId={noteId} onClose={() => setPanel("tasks")} />}
      {panel === "tasks" && (
        <TaskPanel
          tasks={tasks}
          members={members}
          onToggle={handleToggle}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
          onAdd={handleAdd}
        />
      )}
    </div>
  );
}

function PanelToggle({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center gap-1 rounded px-2 py-1 font-mono text-[10px] transition-colors ${
        active ? "bg-accent-soft text-accent" : "text-ink-3 hover:bg-surface-2 hover:text-ink-2"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

/**
 * 본문에서 blockId로 체크박스를 찾아 상태를 바꾼다.
 * DB 값을 반영하는 경로이므로 FROM_DB 표식을 붙여 되돌려 쓰기를 막는다.
 */
function setDocTaskChecked(editor: Editor, blockId: string, checked: boolean): boolean {
  const { state, view } = editor;
  let target: number | null = null;

  state.doc.descendants((node, pos) => {
    if (target !== null) return false;
    if (node.type.name === "taskItem" && node.attrs.blockId === blockId) target = pos;
    return true;
  });

  if (target === null) return false;
  // 이미 같은 값이면 아무것도 하지 않는다. 빈 트랜잭션도 공동 편집에서는 전파된다.
  if (state.doc.nodeAt(target)?.attrs.checked === checked) return true;

  view.dispatch(state.tr.setNodeAttribute(target, "checked", checked).setMeta(FROM_DB, true));
  return true;
}
