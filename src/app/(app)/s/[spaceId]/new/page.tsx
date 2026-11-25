/**
 * S-02a 템플릿 선택 · CODEX
 * 용도에 맞는 템플릿을 먼저 선택하고 노트 생성은 기존 액션에 맡긴다.
 */
import Link from "@/components/PendingLink";
import styles from "@/components/screens/Form.module.css";
import { TemplatePicker } from "@/components/screens/TemplatePicker";
import { TemplatePreview } from "@/components/screens/TemplatePreview";
import { NoteStatusBadge } from "@/components/ui/Badge";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { notes } from "@/lib/db/schema";
import { requireSpaceMember } from "@/lib/access";
import { suggestNoteTitle } from "@/lib/actions/notes";
import { TEMPLATE_ORDER, TEMPLATES, defaultTemplateFor } from "@/lib/templates";
import { relativeTime, todayInSeoul } from "@/lib/utils";

export default async function NewNotePage({ params }: { params: Promise<{ spaceId: string }> }) {
  const { spaceId } = await params;
  const { space } = await requireSpaceMember(spaceId);
  const [templates, recentNotes] = await Promise.all([Promise.all(TEMPLATE_ORDER.map(async (kind) => {
    const suggestion = kind === "blank"
      ? { title: todayInSeoul() + " 메모", sessionNo: undefined }
      : await suggestNoteTitle(spaceId, kind);
    return { kind, label: TEMPLATES[kind].label, blurb: TEMPLATES[kind].blurb, title: suggestion.title,
      preview: <TemplatePreview kind={kind} sessionNo={suggestion.sessionNo ?? undefined} /> };
  })),
    // 권한을 확인한 프로젝트 안에서만 최근 기록을 조회한다.
    db.select({ id: notes.id, title: notes.title, status: notes.status, updatedAt: notes.updatedAt })
      .from(notes).where(and(eq(notes.spaceId, spaceId), isNull(notes.deletedAt)))
      .orderBy(desc(notes.updatedAt), asc(notes.id)).limit(5),
  ]);
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href={"/s/" + spaceId + "?tab=notes"} className={styles.back}>← 노트 목록</Link>
        <h1>새 노트</h1>
        <p>{space.name}</p>
      </header>
      <TemplatePicker spaceId={spaceId} initialTemplate={defaultTemplateFor(space.kind)} templates={templates} />
      {recentNotes.length > 0 && <section aria-labelledby="recent-note-heading" className={styles.recent}>
        <h2 id="recent-note-heading">최근 기록 참고하기</h2>
        <p className={styles.hint}>새 탭에서 이전 기록을 확인할 수 있습니다. 작성 중인 제목은 이 화면에 유지됩니다.</p>
        <ul>{recentNotes.map(note => <li key={note.id}>
          <Link href={`/s/${spaceId}/n/${note.id}`} target="_blank" rel="noopener noreferrer" aria-label={`${note.title} · 새 탭에서 열기`}>
            <span className="flex flex-wrap items-center gap-2"><span className="min-w-0 break-words text-sm font-medium text-ink">{note.title}</span><NoteStatusBadge status={note.status} /></span>
            <span className="text-xs text-ink-3">{relativeTime(note.updatedAt)} 수정 · 새 탭 ↗</span>
          </Link>
        </li>)}</ul>
      </section>}
    </div>
  );
}
