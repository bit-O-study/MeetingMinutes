"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, CalendarDays, CheckSquare, FileText, FolderClosed, Home, Plus, Search } from "lucide-react";

import { searchNotes, type SearchHit } from "@/lib/actions/search";
import { PROJECT_SCOPE_CLASS, projectColor } from "@/components/ui/projectColor";
import styles from "./Palette.module.css";

/** 사이드바 · 상단바의 검색 버튼이 이 이벤트로 팔레트를 연다. */
export const OPEN_PALETTE_EVENT = "moa-open-palette";

type Item = { key: string; label: string; hint?: string; href: string; group: string; icon: React.ReactNode; dot?: string };

/**
 * Ctrl+K 팔레트. 이동 · 새로 만들기 · 노트 검색을 한 입구로 모은다.
 * 노트 검색은 `searchNotes`를 그대로 쓴다 — 권한 범위를 조회 이전에 좁히는 것은 그쪽이 책임진다(설계 원칙 7).
 * 프로젝트 목록은 서버 셸이 이미 내가 속한 것만 내려 주므로 여기서 다시 거르지 않는다.
 */
export function CommandPalette({ projects }: { projects: { id: string; name: string }[] }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const open = () => {
      setQuery("");
      setHits([]);
      setActive(0);
      if (!dialog.current?.open) dialog.current?.showModal();
      input.current?.focus();
    };
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        open();
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_PALETTE_EVENT, open);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_PALETTE_EVENT, open);
    };
  }, []);

  // 입력이 멈춘 뒤에만 조회한다. 늦게 온 응답이 새 입력을 덮지 않도록 취소 표시를 둔다.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      searchNotes(q, { limit: 6 })
        .then((result) => { if (!cancelled) setHits(result.hits); })
        .catch(() => { if (!cancelled) setHits([]); });
    }, 200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query]);

  const items = useMemo<Item[]>(() => {
    const q = query.trim().toLowerCase();
    const icon = (node: React.ReactNode) => node;
    const pages: Item[] = [
      { key: "home", label: "홈", href: "/", group: "이동", icon: icon(<Home size={15} />) },
      { key: "tasks", label: "내 할 일", href: "/tasks", group: "이동", icon: icon(<CheckSquare size={15} />) },
      { key: "calendar", label: "개인 일정", href: "/calendar", group: "이동", icon: icon(<CalendarDays size={15} />) },
      { key: "polls", label: "일정 투표", href: "/polls", group: "이동", icon: icon(<CalendarCheck size={15} />) },
      { key: "projects", label: "프로젝트 모아보기", href: "/projects", group: "이동", icon: icon(<FolderClosed size={15} />) },
      { key: "search", label: "상세 검색", href: "/search", group: "이동", icon: icon(<Search size={15} />) },
    ];
    const spaceItems: Item[] = projects.flatMap((p) => [
      { key: `p-${p.id}`, label: p.name, hint: "프로젝트", href: `/s/${p.id}`, group: "프로젝트", icon: null, dot: PROJECT_SCOPE_CLASS[projectColor(p.id)] },
      { key: `p-${p.id}-n`, label: `${p.name} · 새 노트`, hint: "만들기", href: `/s/${p.id}/new`, group: "만들기", icon: <Plus size={15} /> },
    ]);
    const create: Item[] = [
      { key: "new-space", label: "새 프로젝트 만들기", hint: "만들기", href: "/spaces/new", group: "만들기", icon: <Plus size={15} /> },
      { key: "new-poll", label: "새 일정 투표 만들기", hint: "만들기", href: "/polls/new", group: "만들기", icon: <Plus size={15} /> },
    ];
    const noteItems: Item[] = hits.map((h) => ({
      key: `n-${h.id}`, label: h.title || "제목 없음", hint: h.spaceName, href: `/s/${h.spaceId}/n/${h.id}`, group: "노트", icon: <FileText size={15} />,
    }));
    const all = [...pages, ...spaceItems.filter((i) => i.group === "프로젝트"), ...create, ...spaceItems.filter((i) => i.group === "만들기")];
    // 빈 입력에서는 이동과 프로젝트만 보여 주고, 입력하면 일치하는 것과 노트 검색 결과를 합친다.
    if (!q) return all.filter((i) => i.group !== "만들기").slice(0, 12);
    const matched = all.filter((i) => `${i.label} ${i.hint ?? ""}`.toLowerCase().includes(q));
    return [...noteItems, ...matched].slice(0, 14);
  }, [query, hits, projects]);

  function go(item: Item | undefined) {
    if (!item) return;
    dialog.current?.close();
    router.push(item.href);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") { event.preventDefault(); setActive((i) => Math.min(i + 1, items.length - 1)); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (event.key === "Enter") { event.preventDefault(); go(items[active]); }
  }

  let lastGroup = "";
  return (
    <dialog
      ref={dialog}
      aria-label="빠른 이동과 검색"
      className={styles.palette}
      onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close(); }}
    >
      <div className={styles.inputRow}>
        <Search size={16} aria-hidden="true" />
        <input
          ref={input}
          value={query}
          onChange={(event) => { setQuery(event.target.value); setActive(0); if (event.target.value.trim().length < 2) setHits([]); }}
          onKeyDown={onKeyDown}
          placeholder="이동하거나 노트를 검색하세요"
          aria-label="검색어"
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
          aria-activedescendant={items[active] ? `palette-${items[active].key}` : undefined}
          autoComplete="off"
        />
        <kbd className={styles.kbd}>Esc</kbd>
      </div>
      <ul id="palette-list" role="listbox" className={styles.list}>
        {items.map((item, index) => {
          const header = item.group !== lastGroup;
          lastGroup = item.group;
          return (
            <li key={item.key} role="presentation">
              {header && <div className={styles.group}>{item.group}</div>}
              <button
                id={`palette-${item.key}`}
                type="button"
                role="option"
                aria-selected={index === active}
                className={styles.item}
                data-active={index === active}
                onMouseMove={() => setActive(index)}
                onClick={() => go(item)}
              >
                {item.dot ? <span aria-hidden="true" className={`sidebar-project-dot ${item.dot}`} /> : <span aria-hidden="true" className={styles.icon}>{item.icon}</span>}
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {item.hint && <span className={styles.hint}>{item.hint}</span>}
              </button>
            </li>
          );
        })}
        {items.length === 0 && <li className={styles.empty}>일치하는 항목이 없어요.</li>}
      </ul>
    </dialog>
  );
}

/** 사이드바·상단바에서 쓰는 열기 버튼 동작. */
export function openPalette() {
  window.dispatchEvent(new Event(OPEN_PALETTE_EVENT));
}
