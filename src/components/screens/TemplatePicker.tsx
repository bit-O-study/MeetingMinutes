"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { createNote } from "@/lib/actions/notes";
import type { TemplateKind } from "@/lib/db/schema";
import styles from "./Form.module.css";

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
    }} className={styles.form}>
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
    <fieldset disabled={pending} className={styles.fields}>
      <legend className={styles.label}>노트 양식</legend>
      <div className={styles.choices}>
        {templates.map((template) => (
          <label key={template.kind} className={styles.choice}>
              <input type="radio" name="template" value={template.kind} checked={selected === template.kind}
                onChange={() => onSelect(template.kind)} className="size-4 accent-accent" />
            <span><strong>{template.label}</strong><small>{template.blurb}</small></span>
          </label>
        ))}
      </div>
      {selected === "handover" && (
        <p className={styles.warning}>
          비밀번호·토큰·키 값은 적지 마세요. 보관 위치와 접근 요청처만 남겨 주세요.
        </p>
      )}
      <div>
        <label htmlFor="note-title" className={styles.label}>노트 제목</label>
        <input id="note-title" name="title" value={title} onChange={(event) => onTitle(event.target.value)}
          required maxLength={200}
          className={styles.input} />
        <p className={styles.hint}>제목은 나중에도 바꿀 수 있습니다.</p>
      </div>
      <div className={styles.actions}><button type="submit" disabled={pending || !title.trim()}
        className="ui-button inline-flex h-11 items-center justify-center rounded-lg bg-accent px-5 text-sm font-medium text-on-accent hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
        {pending ? "노트 만드는 중…" : "노트 만들기"}
      </button></div>
      {pending && <p role="status" className="text-xs text-ink-3">노트를 만들고 있습니다. 잠시만 기다려 주세요.</p>}
    </fieldset>
  );
}
