/**
 * S-02a 템플릿 선택 · CODEX
 * 용도에 맞는 템플릿을 먼저 선택하고 노트 생성은 기존 액션에 맡긴다.
 */
import Link from "next/link";
import { SectionHeading } from "@/components/ui/Panels";
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
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-5 py-8">
      <SectionHeading action={<Link href={"/s/" + spaceId} className="text-xs text-ink-2 hover:text-accent">취소</Link>}>새 노트</SectionHeading>
      <p className="break-words text-sm text-ink-2">{space.name}에 함께 작성할 노트를 만듭니다.</p>
      <TemplatePicker spaceId={spaceId} initialTemplate={defaultTemplateFor(space.kind)} templates={templates} />
    </div>
  );
}
