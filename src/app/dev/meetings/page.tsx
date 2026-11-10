import { notFound } from "next/navigation";

import { MeetingCreate } from "@/components/meetings/MeetingCreate";
import { MeetingList } from "@/components/meetings/MeetingList";

import { PREVIEW_MEETING_LIST, PREVIEW_TODAY, SPACE_STUDY } from "../fixtures";

/** 개발 전용: 모임 목록과 만들기 창. ?open=1 이면 만들기 창이 열린 채로 보인다. ?empty=1 은 빈 목록. */
export default async function PreviewMeetingsPage({ searchParams }: PageProps<"/dev/meetings">) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 px-3 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-2">멤버가 가능한 날을 칠하면 가장 맞는 날을 추천해 드려요.</p>
        <MeetingCreate spaceId={SPACE_STUDY} today={PREVIEW_TODAY} defaultOpen={params.open === "1"} defaultStart="2026-11-21" preview />
      </div>
      <MeetingList meetings={params.empty === "1" ? [] : PREVIEW_MEETING_LIST} spaceId={SPACE_STUDY} today={PREVIEW_TODAY} />
    </div>
  );
}
