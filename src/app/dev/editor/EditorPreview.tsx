"use client";

import { useState } from "react";

import { PlannerEditor } from "@/components/screens/PlannerEditor";
import type { LinkTarget } from "@/lib/calendar-entries";
import type { PlannerItem } from "@/lib/planner";

/** 개발 전용: 편집 창을 열어 둔 채로 보여 준다. 닫으면 다시 여는 버튼만 남는다(저장은 하지 않는다). */
export function EditorPreview({ item, kind, date, linkTargets }: { item: PlannerItem | null; kind: "event" | "task"; date: string; linkTargets: LinkTarget[] }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="p-6">
      <button type="button" onClick={() => setOpen(true)} className="rounded-full bg-accent px-4 py-2 text-sm font-bold text-on-accent">편집 창 열기</button>
      {open && <PlannerEditor item={item} kind={kind} date={date} linkTargets={linkTargets} onClose={() => setOpen(false)} />}
    </div>
  );
}
