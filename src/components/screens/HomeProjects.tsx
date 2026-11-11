"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Folder, FolderPlus, Plus, Pencil, Trash2 } from "lucide-react";
import Link from "@/components/PendingLink";
import { AvatarStack } from "@/components/ui/Avatar";
import { ProjectIcon } from "@/components/ui/ProjectIcon";
import { readProjectFolders, type ProjectFolders } from "./project-folders";

type Project = {
  id: string; name: string; kindLabel: string; noteCount: number; activityLabel: string;
  people: { id: string; name: string | null; image: string | null }[];
};
type Gesture = { id: string; pointerId: number; x: number; y: number; active: boolean; timer: ReturnType<typeof setTimeout> };
const control = "rounded-xl px-3 py-2 text-sm font-bold text-ink-2 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent";

export function HomeProjects({ userId, projects }: { userId: string; projects: Project[] }) {
  const [data, setData] = useState<ProjectFolders>({ folders: [], assignments: {} });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [drag, setDrag] = useState<{ id: string; x: number; y: number; target: string | null } | null>(null);
  const root = useRef<HTMLElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const suppressClick = useRef(false);
  const storageKey = `moa:project-folders:v1:${userId}`;

  useEffect(() => {
    const load = () => {
      try {
        setData(readProjectFolders(localStorage.getItem(storageKey)));
        setReady(true);
        setError("");
      } catch {
        setReady(false);
        setError("폴더 정보를 읽을 수 없어요. 브라우저 저장 공간을 확인한 뒤 새로고침해 주세요.");
      }
    };
    load();
    const sync = (event: StorageEvent) => { if (event.key === storageKey || event.key === null) load(); };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [storageKey]);

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

  function persist(next: ProjectFolders, announcement: string) {
    try {
      // TODO(CODEX): 요청 큐의 개인 폴더 액션이 제공되면 기기 간 동기화로 전환한다.
      localStorage.setItem(storageKey, JSON.stringify(next));
      setData(next);
      setError("");
      setMessage(announcement);
      return true;
    } catch {
      setError("폴더 변경을 저장하지 못했어요. 브라우저 저장 공간을 확인하고 다시 시도해 주세요.");
      return false;
    }
  }

  function move(id: string, folderId: string) {
    if (!ready || !projects.some(project => project.id === id) || (folderId && !data.folders.some(folder => folder.id === folderId))) return;
    const assignments = { ...data.assignments };
    if (folderId) assignments[id] = folderId;
    else delete assignments[id];
    persist({ ...data, assignments }, `${projects.find(project => project.id === id)?.name} 프로젝트를 ${data.folders.find(folder => folder.id === folderId)?.name ?? "폴더 밖"}으로 옮겼어요.`);
  }

  function targetAt(x: number, y: number) {
    const target = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-folder-target]");
    return target && root.current?.contains(target) ? target.dataset.folderTarget ?? null : null;
  }

  function start(event: ReactPointerEvent<HTMLAnchorElement>, id: string) {
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
        setMessage("프로젝트를 집었어요. 폴더 위에서 놓으면 이동해요. Esc 키로 취소할 수 있어요.");
      }, 450),
    };
    gesture.current = current;
  }

  function moving(event: ReactPointerEvent<HTMLAnchorElement>) {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (!current.active) {
      if (Math.hypot(event.clientX - current.x, event.clientY - current.y) > 10) {
        clearTimeout(current.timer);
        gesture.current = null;
      }
      return;
    }
    event.preventDefault();
    setDrag({ id: current.id, x: event.clientX, y: event.clientY, target: targetAt(event.clientX, event.clientY) });
  }

  function finish(event: ReactPointerEvent<HTMLAnchorElement>, cancelled = false) {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    clearTimeout(current.timer);
    gesture.current = null;
    setDrag(null);
    if (current.active) {
      const target = cancelled ? null : targetAt(event.clientX, event.clientY);
      if (target !== null) move(current.id, target);
      else setMessage("이동을 취소했어요.");
    }
  }

  const activeFolder = data.folders.find(folder => folder.id === selected);
  const currentFolder = activeFolder?.id ?? "";
  const visible = projects.filter(project => (data.assignments[project.id] ?? "") === currentFolder);

  return (
    <section ref={root} aria-labelledby="home-spaces-heading" className="flex flex-col gap-3">
      <div className="flex items-center gap-2 px-1">
        <h2 id="home-spaces-heading" className="text-[15px] font-extrabold text-ink">내 프로젝트</h2>
        <span className="text-sm text-ink-3">{projects.length}</span>
        <button type="button" disabled={!ready} className={`${control} ml-auto inline-flex items-center gap-1 disabled:opacity-50`} onClick={() => { setEditing(""); setName(""); }}><FolderPlus className="size-4" />새 폴더</button>
      </div>
      <p id="project-folder-help" className="px-1 text-xs text-ink-2">프로젝트를 길게 누른 뒤 폴더로 끌어 놓으세요. 분류는 이 브라우저에만 보관돼요.</p>
      {editing !== null && <form className="flex flex-wrap items-center gap-2 rounded-2xl bg-surface p-3" onSubmit={event => {
        event.preventDefault();
        const trimmed = name.trim();
        if (!trimmed) return;
        if (data.folders.some(folder => folder.id !== editing && folder.name === trimmed)) { setError("같은 이름의 폴더가 있어요."); return; }
        const folders = editing ? data.folders.map(folder => folder.id === editing ? { ...folder, name: trimmed } : folder) : [...data.folders, { id: crypto.randomUUID(), name: trimmed }];
        if (persist({ ...data, folders }, editing ? "폴더 이름을 바꿨어요." : "폴더를 만들었어요.")) setEditing(null);
      }}>
        <label className="flex min-w-0 flex-1 items-center gap-2 text-sm text-ink">폴더 이름<input autoFocus required maxLength={40} value={name} onChange={event => setName(event.target.value)} className="min-w-0 w-full rounded-lg border border-line bg-ground px-3 py-2" /></label>
        <button disabled={!ready || !name.trim()} className={`${control} disabled:opacity-50`}>{editing ? "이름 변경" : "만들기"}</button>
        <button type="button" className={control} onClick={() => setEditing(null)}>취소</button>
      </form>}
      <div className="sticky top-0 z-10 flex flex-wrap gap-2 rounded-2xl bg-ground py-2" aria-label="프로젝트 폴더">
        {[{ id: "", name: "폴더 밖" }, ...data.folders].map(folder => <button key={folder.id} type="button" data-folder-target={folder.id} aria-pressed={currentFolder === folder.id}
          onClick={() => setSelected(folder.id)}
          className={`flex min-w-0 max-w-full items-center gap-2 rounded-xl border px-3 py-3 text-sm font-bold focus-visible:outline-2 focus-visible:outline-accent ${drag?.target === folder.id ? "border-accent bg-accent text-on-accent ring-2 ring-accent" : currentFolder === folder.id ? "border-accent bg-accent-soft text-accent" : "border-line bg-surface text-ink-2"}`}>
          <Folder className="size-4 shrink-0" /><span className="truncate">{folder.name}</span><span>{projects.filter(project => (data.assignments[project.id] ?? "") === folder.id).length}</span>
        </button>)}
      </div>
      {activeFolder && <div className="flex flex-wrap items-center gap-1">
        <h3 className="mr-auto min-w-0 truncate font-bold text-ink">{activeFolder.name}</h3>
        <button className={control} aria-label="폴더 이름 변경" onClick={() => { setEditing(activeFolder.id); setName(activeFolder.name); }}><Pencil className="size-4" /></button>
        <button className={control} aria-label="폴더 삭제" onClick={() => {
          if (!window.confirm(`‘${activeFolder.name}’ 폴더를 삭제할까요? 프로젝트는 삭제되지 않고 폴더 밖으로 이동해요.`)) return;
          const next = { folders: data.folders.filter(folder => folder.id !== activeFolder.id), assignments: Object.fromEntries(Object.entries(data.assignments).filter(([, id]) => id !== activeFolder.id)) };
          if (persist(next, "폴더를 삭제하고 프로젝트를 폴더 밖으로 옮겼어요.")) { setSelected(""); setEditing(null); }
        }}><Trash2 className="size-4" /></button>
      </div>}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <p role="status" className={message ? "text-xs text-ink-2" : "sr-only"}>{message}</p>
      {visible.length === 0 && <p className="rounded-2xl border border-dashed border-line p-5 text-center text-sm text-ink-2">{activeFolder ? "빈 폴더예요. 폴더 밖의 프로젝트를 이 폴더로 옮겨 보세요." : "폴더 밖에 프로젝트가 없어요. 폴더를 열어 프로젝트를 확인하세요."}</p>}
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {visible.map(project => <li key={project.id} className={`flex min-w-0 flex-col rounded-2xl bg-surface ${drag?.id === project.id ? "opacity-50 ring-2 ring-accent" : ""}`}>
          <Link href={`/s/${project.id}`} draggable={false} aria-describedby="project-folder-help"
            onPointerDown={event => start(event, project.id)} onPointerMove={moving}
            onPointerUp={event => finish(event)} onPointerCancel={event => finish(event, true)} onLostPointerCapture={event => finish(event, true)}
            onPointerLeave={event => { if (!gesture.current?.active) finish(event, true); }}
            onContextMenu={event => event.preventDefault()}
            onDragStart={event => event.preventDefault()}
            onClick={event => { if (event.detail !== 0 && suppressClick.current) { event.preventDefault(); suppressClick.current = false; } }}
            style={{ WebkitTouchCallout: "none" }}
            className="flex flex-1 touch-pan-y select-none flex-col gap-3 rounded-2xl p-4 hover:shadow-float focus-visible:outline-2 focus-visible:outline-accent">
            <div className="flex items-start justify-between gap-2"><ProjectIcon spaceId={project.id} name={project.name} /><span className="text-xs font-semibold text-ink-3">{project.kindLabel}</span></div>
            <h3 className="truncate text-base font-extrabold text-ink">{project.name}</h3>
            <div className="mt-auto flex flex-wrap items-center justify-between gap-2"><AvatarStack people={project.people} /><span className="truncate text-xs text-ink-3">노트 {project.noteCount} · {project.activityLabel}</span></div>
          </Link>
          <select aria-label={`${project.name} 폴더 이동`} disabled={!ready} value={data.assignments[project.id] ?? ""} onChange={event => move(project.id, event.target.value)} className="mx-3 mb-3 min-w-0 rounded-lg border border-line bg-surface px-2 py-2 text-xs text-ink-2">
            <option value="">폴더 밖</option>{data.folders.map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
          </select>
        </li>)}
        <li className="min-w-0"><Link href="/spaces/new" className="flex h-full min-h-32 flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-line text-sm font-bold text-ink-3 hover:text-ink-2"><Plus className="size-5" />새 프로젝트</Link></li>
      </ul>
      {drag && <div aria-hidden="true" style={{ left: Math.max(8, Math.min(drag.x + 12, window.innerWidth - 180)), top: Math.max(8, drag.y - 48) }} className="pointer-events-none fixed z-50 max-w-40 truncate rounded-xl bg-accent px-4 py-3 text-sm font-bold text-on-accent shadow-float">{projects.find(project => project.id === drag.id)?.name}</div>}
    </section>
  );
}
