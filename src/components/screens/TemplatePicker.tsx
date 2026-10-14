"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { createNote } from "@/lib/actions/notes";
import type { TemplateKind } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

type TemplateOption = { kind: TemplateKind; label: string; blurb: string; title: string };

export function TemplatePicker({ spaceId, initialTemplate, templates }: {
  spaceId: string;
  initialTemplate: TemplateKind;
  templates: TemplateOption[];
}) {
  const [selected, setSelected] = useState(initialTemplate);
  // 템플릿을 바꿨다가 돌아와도 사용자가 입력한 제목을 잃지 않는다.
  const [titles, setTitles] = useState<Record<TemplateKind, string>>(() =>
    Object.fromEntries(templates.map((template) => [template.kind, template.title])) as Record<TemplateKind, string>);
  return (
    <form action={async () => {
      await createNote({ spaceId, template: selected, title: titles[selected].trim() });
    }}>
      <TemplateFields templates={templates} selected={selected} onSelect={setSelected}
        title={titles[selected]} onTitle={(title) => setTitles((current) => ({ ...current, [selected]: title }))} />
    </form>
  );
}

function TemplateFields({ templates, selected, onSelect, title, onTitle }: {
  templates: TemplateOption[];
  selected: TemplateKind;
  onSelect: (kind: TemplateKind) => void;
  title: string;
  onTitle: (title: string) => void;
}) {
  const { pending } = useFormStatus();
  return (
    <fieldset disabled={pending} className="space-y-5">
      <legend className="mb-3 text-sm font-semibold text-ink">노트 양식</legend>
      <div className="grid gap-3 sm:grid-cols-3">
        {templates.map((template) => (
          <label key={template.kind} className={cn("press cursor-pointer rounded-2xl p-4 transition-shadow focus-within:outline-2 focus-within:outline-accent",
            selected === template.kind ? "bg-surface ring-2 ring-accent" : "bg-surface hover:shadow-float")}>
            <span className="flex items-center gap-2">
              <input type="radio" name="template" value={template.kind} checked={selected === template.kind}
                onChange={() => onSelect(template.kind)} className="size-4 accent-accent" />
              <span className="text-[15px] font-extrabold text-ink">{template.label}</span>
            </span>
            <span className="mt-2 block text-xs leading-relaxed text-ink-2">{template.blurb}</span>
          </label>
        ))}
      </div>
      {selected === "handover" && (
        <p className="rounded-2xl bg-warn-soft p-3 text-sm font-semibold text-warn">
          비밀번호·토큰·키 값은 적지 마세요. 보관 위치와 접근 요청처만 남겨 주세요.
        </p>
      )}
      <div>
        <label htmlFor="note-title" className="mb-2 block text-sm font-medium text-ink">노트 제목</label>
        <input id="note-title" name="title" value={title} onChange={(event) => onTitle(event.target.value)}
          required maxLength={200}
          className="h-11 w-full min-w-0 rounded-2xl bg-surface px-3.5 text-[15px] text-ink ring-1 ring-inset ring-line placeholder:text-ink-3 focus:ring-2 focus:ring-accent focus:outline-none" />
        <p className="mt-2 text-xs text-ink-3">제목은 노트를 만든 뒤에도 바꿀 수 있습니다.</p>
      </div>
      <button type="submit" disabled={pending || !title.trim()}
        className="press inline-flex h-11 items-center justify-center gap-1.5 rounded-2xl bg-accent px-5 text-sm font-bold text-on-accent shadow-sm hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45 w-full sm:w-auto">
        {pending ? "노트 만드는 중…" : "노트 만들기"}
      </button>
      {pending && <p role="status" className="text-xs text-ink-3">노트를 만들고 있습니다. 잠시만 기다려 주세요.</p>}
    </fieldset>
  );
}
