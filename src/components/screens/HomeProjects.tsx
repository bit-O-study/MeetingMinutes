"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Folder, GripVertical, Plus, Pencil, Trash2 } from "lucide-react";
import Link from "@/components/PendingLink";
import { AvatarStack } from "@/components/ui/Avatar";
import { PROJECT_SCOPE_CLASS, projectColor } from "@/components/ui/projectColor";
import { readProjectFolders } from "./project-folders";
import { createProjectFolder, deleteProjectFolder, listMyProjectFolders, moveProjectToFolder, renameProjectFolder, type ProjectFolderData } from "@/lib/actions/project-folders";

type Project = {
  id: string; name: string; kindLabel: string; noteCount: number; activityLabel: string;
  people: { id: string; name: string | null; image: string | null }[];
};
type Gesture = { id: string; pointerId: number; x: number; y: number; active: boolean; timer: ReturnType<typeof setTimeout> };
const control = "rounded-xl px-3 py-2 text-sm font-bold text-ink-2 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent";
const UNGROUPED = "ungrouped";

export function HomeProjects({ userId, projects, initial }: { userId: string; projects: Project[]; initial: ProjectFolderData }) {
  const [data, setData] = useState<ProjectFolderData>(initial);
  // 서버 호출 중에는 다른 변경을 막아 버전 충돌을 스스로 만들지 않는다.
  const [ready, setReady] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [organizing, setOrganizing] = useState(false);
  const [name, setName] = useState("");
  const [drag, setDrag] = useState<{ id: string; x: number; y: number; target: string | null } | null>(null);
  const root = useRef<HTMLElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const suppressClick = useRef(false);
  const grouping = useRef(false);
  const storageKey = `moa:project-folders:v1:${userId}`;

  useEffect(() => {
    // 서버 저장 도입 전 이 브라우저에만 있던 분류를, 서버가 비어 있을 때 한 번만 옮긴다.
    // 실패하면 로컬 데이터를 지우지 않아 다음 방문에 다시 시도한다.
    if (initial.folders.length > 0) return;
    let legacy;
    try { legacy = readProjectFolders(localStorage.getItem(storageKey)); } catch { return; }
    if (legacy.folders.length === 0) return;
    const projectIds = new Set(projects.map(project => project.id));
    (async () => {
      setReady(false);
      const folders: ProjectFolderData["folders"] = []; const assignments: Record<string, string> = {};
      for (const folder of legacy.folders) {
        const created = await createProjectFolder(folder.id, folder.name);
        if (!created.ok) throw new Error(created.error);
        folders.push(created.data);
        for (const [spaceId, folderId] of Object.entries(legacy.assignments)) {
          if (folderId !== folder.id || !projectIds.has(spaceId)) continue;
          const moved = await moveProjectToFolder(spaceId, folder.id);
          if (moved.ok) assignments[spaceId] = folder.id;
        }
      }
      setData({ folders, assignments });
      localStorage.removeItem(storageKey);
      setMessage("이 브라우저에 있던 그룹 분류를 계정에 옮겼어요.");
    })().catch(() => setError("이전 그룹 분류를 옮기지 못했어요. 새로고침하면 다시 시도해요.")).finally(() => setReady(true));
    // 마운트 시 한 번만 실행한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const element = root.current;
    // 길게 누르기 전에는 스크롤을 허용하고, 집어 든 뒤에만 터치 스크롤을 막는다.
    const preventScroll = (event: TouchEvent) => { if (gesture.current?.active) event.preventDefault(); };
    const cancel = () => {
      if (gesture.current) clearTimeout(gesture.current.timer);
      gesture.current = null;
      setDrag(null);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") cancel(); };
    element?.addEventListener("touchmove", preventScroll, { passive: false });
    window.addEventListener("blur", cancel);
    window.addEventListener("keydown", escape);
    return () => {
      if (gesture.current) clearTimeout(gesture.current.timer);
      element?.removeEventListener("touchmove", preventScroll);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("keydown", escape);
    };
  }, []);

  async function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>, apply: () => void, announcement: string) {
    setReady(false); setError("");
    try {
      const result = await action();
      if (!result.ok) { setError(result.error); return false; }
      apply(); setMessage(announcement); return true;
    } catch { setError("저장하지 못했어요. 네트워크를 확인하고 다시 시도해 주세요."); return false; }
    finally { setReady(true); }
  }

  function move(id: string, folderId: string) {
    if (!ready || !projects.some(project => project.id === id) || (folderId && !data.folders.some(folder => folder.id === folderId))) return;
    const assignments = { ...data.assignments };
    if (folderId) assignments[id] = folderId;
    else delete assignments[id];
    void run(() => moveProjectToFolder(id, folderId || null), () => {
      setData(current => ({ ...current, assignments }));
      if (selected === UNGROUPED && projects.every(project => assignments[project.id])) setSelected("");
    }, `${projects.find(project => project.id === id)?.name} 프로젝트를 ${data.folders.find(folder => folder.id === folderId)?.name ?? "전체 목록"}으로 옮겼어요.`);
  }

  function targetAt(x: number, y: number) {
    const target = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-folder-target], [data-project-target]");
    if (!target || !root.current?.contains(target)) return null;
    if (target.dataset.projectTarget) return target.dataset.projectTarget === gesture.current?.id ? null : `project:${target.dataset.projectTarget}`;
    return target.dataset.folderTarget ?? null;
  }

  async function dropOnProject(sourceId: string, targetId: string) {
    if (!ready || grouping.current || sourceId === targetId || !projects.some(project => project.id === targetId)) return;
    const existing = data.assignments[targetId];
    if (existing) {
      if (data.assignments[sourceId] !== existing) move(sourceId, existing);
      return;
    }
    grouping.current = true;
    setReady(false); setError("");
    let createdId: string | null = null;
    try {
      let label = "새 그룹";
      for (let number = 2; data.folders.some(folder => folder.name === label); number++) label = `새 그룹 ${number}`;
      const created = await createProjectFolder(crypto.randomUUID(), label);
      if (!created.ok) throw new Error(created.error);
      createdId = created.data.id;
      // 기존 액션으로 순서대로 반영하고, 중간 실패도 서버 상태를 다시 읽어 화면과 실제 배정을 맞춘다.
      for (const projectId of [targetId, sourceId]) {
        const result = await moveProjectToFolder(projectId, createdId);
        if (!result.ok) throw new Error(result.error);
      }
      const updated = await listMyProjectFolders();
      setData(updated);
      setSelected(current => current === UNGROUPED ? projects.some(project => !updated.assignments[project.id]) ? UNGROUPED : "" : created.data.id);
      setMessage("두 프로젝트를 새 그룹으로 묶었어요. 그룹 이름은 연필 버튼으로 바꿀 수 있어요.");
    } catch (cause) {
      try { setData(await listMyProjectFolders()); } catch { /* 다음 새로고침에서 서버의 배정을 다시 읽는다. */ }
      setError(`${cause instanceof Error ? cause.message : "그룹을 만들지 못했어요."}${createdId ? " 일부 배정이 반영됐을 수 있어요. 목록을 확인해 주세요." : ""}`);
    } finally { grouping.current = false; setReady(true); }
  }

  function start(event: ReactPointerEvent<HTMLElement>, id: string) {
    if (!ready || event.button !== 0 || !event.isPrimary) return;
    if (gesture.current) clearTimeout(gesture.current.timer);
    suppressClick.current = false;
    const element = event.currentTarget;
    const current: Gesture = {
      id, pointerId: event.pointerId, x: event.clientX, y: event.clientY, active: false,
      timer: setTimeout(() => {
        current.active = true;
        suppressClick.current = true;
        element.setPointerCapture(current.pointerId);
        setDrag({ id, x: current.x, y: current.y, target: null });
        setMessage("프로젝트를 집었어요. 그룹 위에서 놓으면 이동해요. Esc 키로 취소할 수 있어요.");
      }, 550),
    };
    gesture.current = current;
  }

  function moving(event: ReactPointerEvent<HTMLElement>) {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (!current.active) {
      if (Math.hypot(event.clientX - current.x, event.clientY - current.y) > 10) {
        clearTimeout(current.timer);
        // 길게 누르기 전에 움직이면 드래그 의도가 아닌 것으로 처리한다.
        gesture.current = null;
      }
      return;
    }
    event.preventDefault();
    setDrag({ id: current.id, x: event.clientX, y: event.clientY, target: targetAt(event.clientX, event.clientY) });
  }

  function finish(event: ReactPointerEvent<HTMLElement>, cancelled = false) {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    clearTimeout(current.timer);
    gesture.current = null;
    setDrag(null);
    if (current.active) {
      const target = cancelled ? null : targetAt(event.clientX, event.clientY);
      if (target?.startsWith("project:")) void dropOnProject(current.id, target.slice(8));
      else if (target !== null) move(current.id, target);
      else setMessage("이동을 취소했어요.");
    }
  }

  const activeFolder = data.folders.find(folder => folder.id === selected);
  // 목록과 개수를 같은 배정 상태에서 계산해 그룹 이동 직후 함께 갱신한다.
  const ungrouped = projects.filter(project => !data.assignments[project.id]);
  const currentFolder = selected === UNGROUPED && ungrouped.length > 0 ? UNGROUPED : activeFolder?.id ?? "";
  const visible = currentFolder === UNGROUPED ? ungrouped : currentFolder ? projects.filter(project => data.assignments[project.id] === currentFolder) : projects;

  return (
    <section ref={root} aria-labelledby="home-spaces-heading" className="flex flex-col gap-3">
      <div className="flex items-center gap-2 px-1">
        <h2 id="home-spaces-heading" className="sr-only">내 프로젝트</h2>
        <span className="text-xs text-ink-2">{projects.length}개의 프로젝트</span>
        <button type="button" aria-pressed={organizing} onClick={() => setOrganizing(value => !value)} className="ml-auto min-h-11 rounded-xl px-3 text-xs text-ink-2 hover:bg-surface-2">{organizing ? "정리 완료" : "정리"}</button>
        <button type="button" disabled={!ready} aria-label="폴더 추가" aria-expanded={editing === ""}
          onClick={() => { setEditing(""); setName(""); setError(""); }}
          className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-xl px-3 text-xs text-ink-2 hover:bg-accent-soft hover:text-accent focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50"><Plus className="size-4" />폴더</button>
      </div>
      <p id="project-folder-help" className={organizing ? "rounded-xl bg-accent-soft p-3 text-xs leading-relaxed text-accent" : "sr-only"}>이동 손잡이를 꾹 누른 뒤 끌어 보세요. 카드끼리 겹치면 그룹이 돼요.</p>
      {editing !== null && <form className="flex flex-wrap items-center gap-2 rounded-2xl bg-surface p-3" onSubmit={async event => {
        event.preventDefault();
        const trimmed = name.trim();
        if (!ready || !trimmed) return;
        if (data.folders.some(folder => folder.id !== editing && folder.name === trimmed)) { setError("같은 이름의 폴더가 있어요."); return; }
        if (editing) {
          const target = data.folders.find(folder => folder.id === editing); if (!target) return;
          setReady(false); setError("");
          try {
            const result = await renameProjectFolder({ id: target.id, version: target.version }, trimmed);
            if (!result.ok) { setError(result.error); return; }
            setData(current => ({ ...current, folders: current.folders.map(folder => folder.id === editing ? { ...folder, name: trimmed, version: result.data.version } : folder) }));
            setMessage("그룹 이름을 바꿨어요."); setEditing(null);
          } catch { setError("저장하지 못했어요. 네트워크를 확인하고 다시 시도해 주세요."); } finally { setReady(true); }
          return;
        }
        setReady(false); setError("");
        try {
          const result = await createProjectFolder(crypto.randomUUID(), trimmed);
          if (!result.ok) { setError(result.error); return; }
          setData(current => ({ ...current, folders: [...current.folders, result.data] }));
          setMessage(`${trimmed} 폴더를 만들었어요. 프로젝트를 끌어 넣어 보세요.`); setEditing(null);
        } catch { setError("저장하지 못했어요. 네트워크를 확인하고 다시 시도해 주세요."); } finally { setReady(true); }
      }}>
        <label className="flex min-w-0 basis-full items-center gap-2 text-sm text-ink sm:basis-auto sm:flex-1"><span className="shrink-0">폴더 이름</span><input autoFocus required disabled={!ready} maxLength={40} placeholder="예: 업무, 스터디" value={name} onChange={event => setName(event.target.value)} className="min-w-0 w-full rounded-lg border border-line bg-ground px-3 py-2" /></label>
        <button disabled={!ready || !name.trim()} className={`${control} disabled:opacity-50`}>{editing ? "이름 변경" : "만들기"}</button>
        <button type="button" disabled={!ready} className={control} onClick={() => setEditing(null)}>취소</button>
      </form>}
      <div className="flex flex-col gap-3" aria-label="프로젝트 그룹">
        {[[{ id: "", name: "전체" }, ...(ungrouped.length > 0 ? [{ id: UNGROUPED, name: "미소속" }] : [])], data.folders].filter(group => group.length > 0).map((group, index) => <div key={index} className="flex flex-wrap gap-2" aria-label={index === 0 ? "프로젝트 보기" : "내 폴더"}>{group.map(folder => <button key={folder.id} type="button" data-folder-target={folder.id === UNGROUPED ? "" : folder.id || undefined} aria-pressed={currentFolder === folder.id}
          onClick={() => setSelected(folder.id)}
          className={`flex min-w-0 max-w-full items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-accent ${folder.id && drag?.target === (folder.id === UNGROUPED ? "" : folder.id) ? "border-accent bg-accent text-on-accent ring-2 ring-accent" : currentFolder === folder.id ? "border-accent bg-accent-soft text-accent" : "border-line bg-surface text-ink-2"}`}>
          {index > 0 && <Folder className="size-4 shrink-0" />}<span className="truncate">{folder.name}</span><span className="text-xs opacity-70">{folder.id === UNGROUPED ? ungrouped.length : folder.id ? projects.filter(project => data.assignments[project.id] === folder.id).length : projects.length}</span>
        </button>)}</div>)}
      </div>
      {drag && data.assignments[drag.id] && <div data-folder-target="" className="sticky top-[calc(var(--safe-top)+112px)] z-10 rounded-xl border-2 border-dashed border-accent bg-accent-soft p-4 text-center text-sm text-accent">여기에 놓아 그룹에서 꺼내기</div>}
      {activeFolder && organizing && <div className="flex flex-wrap items-center gap-1">
        <h3 className="mr-auto min-w-0 truncate font-bold text-ink">{activeFolder.name}</h3>
        <button className={control} aria-label="그룹 이름 변경" onClick={() => { setEditing(activeFolder.id); setName(activeFolder.name); }}><Pencil className="size-4" /></button>
        <button className={control} disabled={!ready} aria-label="그룹 삭제" onClick={async () => {
          if (!window.confirm(`‘${activeFolder.name}’ 그룹를 삭제할까요? 프로젝트는 삭제되지 않고 전체 목록으로 이동해요.`)) return;
          const next = { folders: data.folders.filter(folder => folder.id !== activeFolder.id), assignments: Object.fromEntries(Object.entries(data.assignments).filter(([, id]) => id !== activeFolder.id)) };
          if (await run(() => deleteProjectFolder({ id: activeFolder.id, version: activeFolder.version }), () => setData(next), "그룹를 삭제하고 프로젝트를 전체 목록으로 옮겼어요.")) { setSelected(""); setEditing(null); }
        }}><Trash2 className="size-4" /></button>
      </div>}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <p role="status" className={message && organizing ? "text-xs text-ink-2" : "sr-only"}>{message}</p>
      {visible.length === 0 && <p className="rounded-2xl border border-dashed border-line p-5 text-center text-sm text-ink-2">{currentFolder === UNGROUPED ? "미소속 프로젝트가 없어요." : activeFolder ? "빈 그룹이에요. 프로젝트를 이 그룹으로 옮겨 보세요." : "아직 프로젝트가 없어요."}</p>}
      <ul className="grid grid-cols-2 gap-3 xl:grid-cols-3">
        {visible.map(project => <li key={project.id} data-project-target={project.id} className={`project-card ${PROJECT_SCOPE_CLASS[projectColor(project.id)]} relative flex min-w-0 flex-col rounded-2xl border border-line bg-surface ${drag?.id === project.id ? "opacity-50 ring-2 ring-accent" : drag?.target === `project:${project.id}` ? "ring-2 ring-accent bg-accent-soft" : ""}`}>
          <button type="button" disabled={!ready} aria-label={project.name + " 이동 손잡이"}
            onPointerDown={event => { event.preventDefault(); start(event, project.id); }} onPointerMove={moving}
            onPointerLeave={event => { if (!gesture.current?.active) finish(event, true); }}
            onPointerUp={event => finish(event)} onPointerCancel={event => finish(event, true)} onLostPointerCapture={event => finish(event, true)}
            className="absolute right-2 top-2 z-[1] grid size-10 touch-none select-none place-items-center rounded-lg text-ink-3 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent"
            style={{ touchAction: "none" }}><GripVertical className="size-4" /></button>
          <Link href={`/s/${project.id}`} draggable={false} aria-describedby="project-folder-help"
            onPointerDown={event => start(event, project.id)} onPointerMove={moving}
            onPointerUp={event => finish(event)} onPointerCancel={event => finish(event, true)} onLostPointerCapture={event => finish(event, true)}
            onPointerLeave={event => { if (!gesture.current?.active) finish(event, true); }}
            onContextMenu={event => event.preventDefault()}
            onDragStart={event => event.preventDefault()}
            onClick={event => { if (event.detail !== 0 && suppressClick.current) { event.preventDefault(); suppressClick.current = false; } }}
            style={{ WebkitTouchCallout: "none" }}
            className="rounded-2xl flex min-w-0 flex-1 touch-pan-y select-none flex-col gap-3 p-3 sm:p-5 focus-visible:outline-2 focus-visible:outline-accent">
            <div className="flex flex-wrap items-start gap-2 pr-8"><span className="text-xs font-semibold text-ink-3">{project.kindLabel}</span></div>
            <h3 className="line-clamp-2 [overflow-wrap:anywhere] text-sm sm:text-base font-semibold tracking-tight text-ink">{project.name}</h3>
            <div className="mt-auto flex flex-wrap items-center justify-between gap-2"><AvatarStack people={project.people} /><span className="truncate text-xs text-ink-3">노트 {project.noteCount} · {project.activityLabel}</span></div>
          </Link>
          {organizing && data.assignments[project.id] && <button type="button" disabled={!ready} onClick={() => move(project.id, "")} className="mx-4 mb-3 self-start text-xs text-ink-2 underline underline-offset-4">그룹에서 꺼내기</button>}
        </li>)}
      </ul>
      {drag && <div aria-hidden="true" style={{ left: Math.max(8, Math.min(drag.x + 12, window.innerWidth - 180)), top: Math.max(8, drag.y - 48) }} className="pointer-events-none fixed z-50 max-w-40 truncate rounded-xl bg-accent px-4 py-3 text-sm font-bold text-on-accent shadow-float">{projects.find(project => project.id === drag.id)?.name}</div>}
    </section>
  );
}
