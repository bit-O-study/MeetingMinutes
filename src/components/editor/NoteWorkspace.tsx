"use client";

import { useCallback, useEffect, useRef, useState, type ComponentProps } from "react";
import dynamic from "next/dynamic";
import * as Y from "yjs";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import { ySyncPluginKey } from "y-prosemirror";
import { History, Share2 } from "lucide-react";

import { createLatestSync } from "@/lib/latest-sync";
import type { DocTaskInput } from "@/lib/tasks-diff";
import { saveNoteContent } from "@/lib/actions/notes";
import { deleteTask, listNoteTasks, syncNoteTasks, toggleTaskInNote, updateTask } from "@/lib/actions/tasks";
import { useCollab, type CollabUser } from "@/lib/collab/useCollab";
import { ConnectionBadge } from "@/components/editor/ConnectionBadge";
import { NoteHeader } from "./NoteHeader";
import { TaskPanel, type Member, type TaskPatch } from "@/components/editor/TaskPanel";
import { TaskItemWithId, collectDocTasks } from "@/components/editor/TaskItemWithId";
import { templateSeedUpdate } from "@/components/editor/template-seed";
import { AvatarStack } from "@/components/ui/Avatar";
import { ReadOnlyNote } from "@/components/ReadOnlyNote";
import { ParagraphIndent, PasteMarkdown } from "@/components/editor/EditingExtensions";
import { NoteImage } from "@/components/editor/NoteImage";
import { PhotoUpload } from "@/components/editor/PhotoUpload";
import { useBackClose } from "@/components/useBackClose";
import type { Task } from "@/lib/db/schema";

// 이력·공유 패널은 눌러야 열린다. 노트 편집 첫 화면 번들에서 뺀다.
const HistoryPanel = dynamic(() => import("@/components/editor/HistoryPanel").then((m) => m.HistoryPanel), {
  loading: () => <PanelLoading />,
});
const SharePanel = dynamic(() => import("@/components/editor/SharePanel").then((m) => m.SharePanel), {
  loading: () => <PanelLoading />,
});

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
  header,
  noteId,
  me,
  initialContent,
  initialTasks,
  members,
}: {
  header: Omit<ComponentProps<typeof NoteHeader>, "connection">;
  noteId: string;
  me: CollabUser;
  initialContent: unknown;
  initialTasks: Task[];
  members: Member[];
}) {
  const { doc, provider, status, syncedAt, peers, persistedAt, pending } = useCollab(noteId, me);
  const [saveError, setSaveError] = useState("");
  const [taskError, setTaskError] = useState("");
  const [connectionSlow, setConnectionSlow] = useState(false);
  useEffect(() => {
    if (syncedAt) return;
    const timer = setTimeout(() => setConnectionSlow(true), 8000);
    return () => clearTimeout(timer);
  }, [syncedAt]);
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  // 우측 패널은 한 번에 하나만 뜬다. 셋을 동시에 열면 본문이 좁아진다.
  const [panel, setPanel] = useState<"tasks" | "history" | "share">("tasks");
  const closePanel = useCallback(() => setPanel("tasks"), []);
  // 휴대폰에서 이력·공유는 화면을 덮는 시트로 열린다. 뒤로가기로 닫혀야 한다.
  useBackClose(panel !== "tasks", closePanel);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const taskTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorRef = useRef<Editor | null>(null);

  /**
   * 이 클라이언트가 **알고 있는** 체크박스 목록 — 마지막으로 동기화했거나 DB 값으로 맞춘 상태.
   * 서버는 이것과 지금 본문의 차이(이 클라이언트가 실제로 바꾼 것)만 반영한다.
   * 노트를 열 때(reconcile) 처음 채운다. 그 전에는 할 일 동기화를 하지 않는다.
   */
  const baseline = useRef<DocTaskInput[] | null>(null);

  /**
   * DB의 완료 상태를 본문에 맞춘다. 단, 이 클라이언트가 바꾸고 아직 보내지 않은
   * 체크(본문 ≠ baseline)는 건드리지 않는다 — 사용자의 마지막 조작이 이긴다.
   * '내 할 일'에서 완료한 것이 열린 노트에도 퍼지는 경로다(본문 변경은 Yjs로 모두에게 간다).
   */
  const applyDbDone = useCallback((rows: Task[]): boolean => {
    const editor = editorRef.current;
    const known = baseline.current;
    if (!editor || editor.isDestroyed || !known) return false;
    const inDoc = new Map(collectDocTasks(editor.state.doc).map((item) => [item.blockId, item]));
    const next = known.map((item) => ({ ...item }));
    const byBlock = new Map(next.map((item) => [item.blockId, item]));
    let changed = false;
    for (const row of rows) {
      if (!row.blockId) continue;
      const docItem = inDoc.get(row.blockId);
      const knownItem = byBlock.get(row.blockId);
      if (!docItem || !knownItem || docItem.checked !== knownItem.checked) continue;
      const done = Boolean(row.doneAt);
      if (done === docItem.checked) continue;
      setDocTaskChecked(editor, row.blockId, done);
      knownItem.checked = done;
      changed = true;
    }
    if (changed) baseline.current = next;
    return changed;
  }, []);

  const [syncTasks] = useState(() => createLatestSync<DocTaskInput[]>(
    async (items) => {
      const rows = await syncNoteTasks(noteId, items, baseline.current ?? items);
      baseline.current = items;
      setTasks(rows);
      setTaskError("");
      // 이 클라이언트가 모르는 사이 DB에서 바뀐 완료 상태를 본문에 반영한다.
      if (applyDbDone(rows)) syncTasks.reset();
    },
    () => setTaskError("할 일 동기화에 실패했습니다. 연결을 확인하세요."),
  ));
  const seeded = useRef(false);
  const reconciled = useRef(false);

  const editor = useEditor(
    {
      immediatelyRender: false,
      shouldRerenderOnTransaction: false,
      extensions: [
        // Yjs가 되돌리기를 담당하므로 Tiptap 자체 히스토리는 끈다.
        StarterKit.configure({ undoRedo: false, codeBlock: { enableTabIndentation: true } }),
        TaskList,
        TaskItemWithId.configure({ nested: true }),
        Markdown.configure({ markedOptions: { breaks: true } }),
        NoteImage,
        ParagraphIndent,
        NoteImage,
        PasteMarkdown,
        Placeholder.configure({ placeholder: "여기에 적으세요" }),
        Collaboration.configure({ document: doc }),
        ...(provider
          ? [CollaborationCaret.configure({ provider, user: { id: me.id, name: me.name, color: me.color, image: me.image ?? null } })]
          : []),
      ],
      editorProps: {
        attributes: {
          class: "tiptap min-h-[60vh] px-1 py-2 text-base text-ink",
          role: "textbox", "aria-label": "노트 본문", "aria-multiline": "true",
          // 모바일 예측 입력이 조합 중인 contenteditable 텍스트를 교체하지 않게 한다.
          autocorrect: "off", autocapitalize: "off", autocomplete: "off", spellcheck: "false",
        },
      },
      onUpdate({ editor, transaction }) {
        // 남이 친 글자까지 내가 저장하면 같은 쓰기를 접속자 수만큼 하게 된다.
        // y-prosemirror가 원격 변경에 남기는 표식으로 걸러낸다.
        const remote = transaction.getMeta(ySyncPluginKey)?.isChangeOrigin === true;
        if (remote) return;

        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(function saveWhenReady() {
          if (editor.isDestroyed) return;
          if (editor.view.composing) { saveTimer.current = setTimeout(saveWhenReady, 200); return; }
          void saveNoteContent(noteId, editor.getJSON()).then(() => setSaveError(""), () => setSaveError("본문 저장에 실패했습니다. 연결을 확인하고 이 창을 유지하세요."));
        }, SAVE_DEBOUNCE_MS);

        // DB에서 밀어 넣은 변경이면 본문만 저장하고 할 일은 건드리지 않는다.
        if (transaction.getMeta(FROM_DB)) return;

        if (taskTimer.current) clearTimeout(taskTimer.current);
        taskTimer.current = setTimeout(function syncWhenReady() {
          if (editor.isDestroyed) return;
          // 노트를 열 때 DB와 맞추기 전에는 "이 클라이언트가 알던 상태"가 없다. 기다린다.
          if (editor.view.composing || !baseline.current) { taskTimer.current = setTimeout(syncWhenReady, 200); return; }
          taskTimer.current = null;
          void syncTasks(collectDocTasks(editor.state.doc));
        }, TASK_DEBOUNCE_MS);
      },
    },
    [provider, doc],
  );
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  /**
   * 휴대폰 키보드가 올라오면(화면이 줄어들면) 커서 줄을 보이는 곳으로 올린다(2026-10-14).
   * 노트 본문 키보드 문제의 의심 지점 — 키보드가 커서를 덮어 무엇을 치는지 안 보였다.
   * 뷰포트를 키보드에 맞춰 줄이는 설정(layout.tsx 의 interactiveWidget)과 같이 쓴다.
   */
  useEffect(() => {
    if (!editor) return;
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) return;
    let frame = 0;
    const follow = () => {
      if (!editor.isFocused || editor.isDestroyed) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => editor.commands.scrollIntoView());
    };
    vv.addEventListener("resize", follow);
    editor.on("focus", follow);
    return () => {
      cancelAnimationFrame(frame);
      vv.removeEventListener("resize", follow);
      editor.off("focus", follow);
    };
  }, [editor]);

  /**
   * 빈 Yjs 문서에만 템플릿을 심는다. 내용이 있는데 심으면 남이 쓴 것과 겹친다.
   * 둘이 동시에 처음 열어도 한 벌만 남도록 노트별 고정 clientID로 만든 업데이트를 적용한다
   * (template-seed.ts). Yjs 문서에 직접 적용하므로 에디터에는 원격 변경으로 들어온다.
   */
  useEffect(() => {
    if (!editor || seeded.current || !initialContent) return;
    if (!provider?.synced) return;
    seeded.current = true;
    if (!editor.isEmpty) return;
    try {
      Y.applyUpdate(doc, templateSeedUpdate(editor.schema, initialContent, noteId));
    } catch {
      // 저장된 내용이 지금 스키마로 읽히지 않으면(확장을 뺀 경우 등) 예전 방식으로 심는다.
      editor.commands.setContent(initialContent as never, { emitUpdate: false });
    }
  }, [editor, provider?.synced, initialContent, doc, noteId]);

  /**
   * 노트를 열 때 완료 여부를 DB 기준으로 한 번 맞추고, "이 클라이언트가 아는 상태"를 정한다.
   *
   * 내 할 일 화면에서 체크한 것은 본문을 건드리지 못한다. 그래서 여기서
   * 따라잡지 않으면 "목록에선 완료인데 회의록에선 미완료"가 남는다.
   * 본문에 없는데 DB에 남은 연동 할 일(동기화 전에 창이 닫힌 경우)은 아는 목록에 넣어
   * 다음 동기화 때 정리되게 한다.
   */
  useEffect(() => {
    if (!editor || reconciled.current || !provider?.synced || !seeded.current) return;
    reconciled.current = true;

    for (const task of tasks) {
      if (!task.blockId) continue;
      setDocTaskChecked(editor, task.blockId, Boolean(task.doneAt));
    }
    const inDoc = collectDocTasks(editor.state.doc);
    const present = new Set(inDoc.map((item) => item.blockId));
    const orphans = tasks
      .filter((task) => task.blockId && !present.has(task.blockId))
      .map((task) => ({ blockId: task.blockId as string, body: task.body, checked: Boolean(task.doneAt) }));
    baseline.current = [...inDoc, ...orphans];
    // tasks는 의도적으로 제외한다 — 최초 1회만 맞춘다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, provider?.synced]);

  /**
   * 다른 탭·'내 할 일'에서 돌아오면 DB를 다시 읽어 패널과 본문 체크를 맞춘다.
   * 노트를 열어 둔 채 다른 화면에서 완료한 것이 여기서 미완료로 남지 않게 한다.
   */
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== "visible" || !baseline.current || taskTimer.current) return;
      void listNoteTasks(noteId).then((rows) => {
        if (taskTimer.current) return; // 그 사이 편집이 시작됐으면 그 동기화가 맞춘다.
        setTasks(rows);
        if (applyDbDone(rows)) syncTasks.reset();
      }, () => {});
    };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [noteId, applyDbDone, syncTasks]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (taskTimer.current) clearTimeout(taskTimer.current);
    };
  }, []);

  /** 이력 패널의 "지금 내용"은 편집을 따라가야 한다. 패널이 열려 있을 때만 갱신한다. */
  const [currentDoc, setCurrentDoc] = useState<unknown>(null);
  useEffect(() => {
    if (panel !== "history" || !editor) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const capture = () => setCurrentDoc(editor.getJSON());
    capture();
    const onUpdate = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(capture, 400);
    };
    editor.on("update", onUpdate);
    return () => {
      if (timer) clearTimeout(timer);
      editor.off("update", onUpdate);
    };
  }, [panel, editor]);

  /** 패널에서 체크하면 DB와 본문을 함께 바꾼다. 한쪽만 바뀌면 바로 어긋난다. */
  const handleToggle = useCallback(
    async (task: Task, next: boolean) => {
      try {
        const rows = await toggleTaskInNote(noteId, task.id, next);
        if (editor && task.blockId) {
          setDocTaskChecked(editor, task.blockId, next);
          // DB 쪽에서 바뀐 값이므로 "아는 상태"도 맞추고, 직전 전송 기록을 잊는다.
          // 안 그러면 본문에서 다시 되돌렸을 때 "직전과 같은 상태"라며 전송하지 않았다.
          baseline.current = baseline.current?.map((item) =>
            item.blockId === task.blockId ? { ...item, checked: next } : item) ?? null;
          syncTasks.reset();
        }
        setTasks(rows); setTaskError("");
      } catch { setTaskError("완료 상태를 저장하지 못했습니다. 다시 시도하세요."); }
    },
    [editor, noteId, syncTasks],
  );

  /**
   * 담당자·기한 변경. 본문에는 적을 자리가 없어 tasks에만 있는 값이라
   * 에디터를 건드리지 않는다.
   */
  const handleUpdate = useCallback(
    async (taskId: string, patch: TaskPatch) => {
      try { setTasks(await updateTask(taskId, patch)); setTaskError(""); } catch { setTaskError("할 일을 수정하지 못했습니다. 다시 시도하세요."); }
    },
    [],
  );

  /** 본문과 이어진 항목은 패널에서 삭제를 노출하지 않는다 — 다음 동기화 때 되살아난다. */
  const handleDelete = useCallback(async (taskId: string) => {
    try { setTasks(await deleteTask(taskId)); setTaskError(""); } catch { setTaskError("할 일을 삭제하지 못했습니다. 다시 시도하세요."); }
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
    <>
    <NoteHeader {...header} connection={<ConnectionBadge status={status} syncedAt={persistedAt} pending={pending} />} />
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <div className="flex min-w-0 flex-1 flex-col">
        <div data-testid="note-toolbar" className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-2 border-b border-line px-3 py-2 md:px-6">
          <PhotoUpload editor={syncedAt ? editor : null} noteId={noteId} />
          <div className="flex shrink-0 items-center gap-1">
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
          <div className="ml-auto max-w-full"><AvatarStack people={peers.map((p) => ({ id: p.id, name: p.name, image: p.image }))} /></div>
        </div>
        {/* 본문 줄 길이를 680px 안팎으로 묶는다 — 넓은 화면에서 한 줄이 너무 길면 읽기 어렵다(재디자인). */}
        <div className="mx-auto w-full max-w-[720px] min-w-0 flex-1 overflow-y-auto px-4 py-5 md:px-6">
          {(saveError || taskError) && <p role="alert" className="mb-3 rounded-2xl bg-warn-soft p-3 text-sm font-semibold text-warn">{saveError || taskError}</p>}
          {!syncedAt && (
            <div aria-busy={!connectionSlow}>
              <p role="status" className="mb-2 text-xs text-ink-3">{connectionSlow ? "편집 연결이 지연되고 있습니다. 아래에서 내용을 읽을 수 있습니다." : "편집 연결 중…"}</p>
              {connectionSlow && <button className="press mb-3 inline-flex h-10 items-center rounded-xl bg-accent-soft px-4 text-sm font-bold text-accent" onClick={() => { provider?.disconnect(); provider?.connect(); }}>다시 연결</button>}
              <ReadOnlyNote content={initialContent} />
            </div>
          )}
          <div hidden={!syncedAt}><EditorContent editor={editor} /></div>
        </div>
      </div>

      {panel !== "tasks" && (
        /*
          휴대폰(1단 레이아웃)에서는 패널이 본문 아래에 붙어서, 긴 노트에선 "이력"을 눌러도
          화면 밖에 열려 아무 반응이 없는 것처럼 보였다. 좁은 화면에선 아래에서 올라오는
          시트로 띄운다. 넓은 화면에선 감싸는 요소가 사라져(lg:contents) 기존 2분할 그대로다.
        */
        <div className="fixed inset-0 z-40 flex flex-col justify-end lg:contents">
          <button type="button" aria-label="패널 닫기" className="absolute inset-0 bg-ink/40 lg:hidden" onClick={closePanel} />
          <div className="relative flex max-h-[85dvh] min-h-[50dvh] flex-col overflow-hidden rounded-t-3xl bg-surface shadow-float lg:contents">
            {panel === "history" && (
              <HistoryPanel
                noteId={noteId}
                currentDoc={currentDoc}
                onRestore={handleRestore}
                onClose={closePanel}
              />
            )}
            {panel === "share" && <SharePanel noteId={noteId} onClose={closePanel} />}
          </div>
        </div>
      )}
      {/* 할 일 패널은 휴대폰에서도 본문 아래에 늘 있다. 이력·공유를 연 동안에도 숨기지 않는다(시트가 덮는다). */}
      <div className={panel === "tasks" ? "contents" : "contents lg:hidden"}>
        <TaskPanel
          tasks={tasks}
          members={members}
          onToggle={handleToggle}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
          onAdd={handleAdd}
        />
      </div>
    </div>
    </>
  );
}

function PanelLoading() {
  return <p className="px-4 py-3 text-xs text-ink-3">불러오는 중…</p>;
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
      className={`inline-flex h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-2.5 text-xs font-semibold transition-colors ${
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
