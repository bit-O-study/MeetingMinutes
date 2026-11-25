"use client";

import { Search } from "lucide-react";
import { openPalette } from "./CommandPalette";

/** 사이드바의 검색 입구. 눌러서도, Ctrl+K 로도 같은 팔레트가 열린다. */
export function SearchButton({ className }: { className?: string }) {
  return (
    <button type="button" onClick={openPalette} className={className} aria-label="검색 또는 이동 (Ctrl+K)" aria-keyshortcuts="Control+K">
      <Search className="size-4" />
      <span className="flex-1 text-left">검색</span>
      <kbd className="sidebar-kbd">Ctrl K</kbd>
    </button>
  );
}
