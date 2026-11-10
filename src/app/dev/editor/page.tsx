import { notFound } from "next/navigation";

import { PREVIEW_LINK_TARGETS, PREVIEW_TODAY, previewCalendar } from "../fixtures";
import { EditorPreview } from "./EditorPreview";

/**
 * 개발 전용: 일정·할 일 편집 창. DB·로그인 없이 연다. 운영 빌드에서는 열리지 않는다.
 * ?item=trip(여러 날 일정) | timed(시각 있는 일정) | linked(모임에 딸린 할 일) | new-event | new-task
 */
export default async function PreviewEditorPage({ searchParams }: PageProps<"/dev/editor">) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const which = typeof params.item === "string" ? params.item : "new-event";
  const planner = previewCalendar("2026-11").planner;
  const find = (title: string) => planner.find((row) => row.title === title) ?? null;
  const item = which === "trip" ? find("부산 출장") : which === "timed" ? find("치과") : which === "linked" ? find("발표 자료 정리") : null;
  const kind = item ? item.kind : which === "new-task" ? "task" : "event";
  return <EditorPreview key={which} item={item} kind={kind} date={PREVIEW_TODAY} linkTargets={PREVIEW_LINK_TARGETS} />;
}
