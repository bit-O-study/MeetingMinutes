/**
 * S-02a 템플릿 선택 · CODEX
 * 용도에 맞는 템플릿을 먼저 선택하고 노트 생성은 기존 액션에 맡긴다.
 */
import Link from "@/components/PendingLink";
import styles from "@/components/screens/Form.module.css";
import { TemplatePicker } from "@/components/screens/TemplatePicker";
import { requireSpaceMember } from "@/lib/access";
import { suggestNoteTitle } from "@/lib/actions/notes";
import { TEMPLATE_ORDER, TEMPLATES, defaultTemplateFor } from "@/lib/templates";
import { todayInSeoul } from "@/lib/utils";

export default async function NewNotePage({ params }: { params: Promise<{ spaceId: string }> }) {
  const { spaceId } = await params;
  const { space } = await requireSpaceMember(spaceId);
  const templates = await Promise.all(TEMPLATE_ORDER.map(async (kind) => {
    const suggestion = kind === "blank"
      ? { title: todayInSeoul() + " 메모" }
      : await suggestNoteTitle(spaceId, kind);
    return { kind, label: TEMPLATES[kind].label, blurb: TEMPLATES[kind].blurb, title: suggestion.title };
  }));
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href={"/s/" + spaceId + "?tab=notes"} className={styles.back}>← 노트 목록</Link>
        <h1>새 노트</h1>
        <p>{space.name}</p>
      </header>
      <TemplatePicker spaceId={spaceId} initialTemplate={defaultTemplateFor(space.kind)} templates={templates} />
    </div>
  );
}
