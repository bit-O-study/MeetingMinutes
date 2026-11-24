import { ButtonLink } from "@/components/ui/Button";
import { isIsoDay } from "@/lib/calendar-dates";
import { listSpaceMeetings } from "@/lib/meeting-data";
import { todayInSeoul } from "@/lib/utils";

import { MeetingCreate } from "./MeetingCreate";
import { MeetingList } from "./MeetingList";

/** 스페이스 화면의 "일정" 탭. 스스로 데이터를 읽어서 스페이스 화면의 조회 묶음을 건드리지 않는다. */
export async function MeetingsTab({ spaceId, query }: { spaceId: string; query: Record<string, string | string[] | undefined> }) {
  const today = todayInSeoul();
  const meetings = await listSpaceMeetings(spaceId);
  const start = typeof query.start === "string" && isIsoDay(query.start) ? query.start : undefined;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-2">멤버가 가능한 날을 칠하면 가장 맞는 날을 추천해 드려요.</p>
        <div className="flex flex-wrap items-center gap-2">
          {/* 멤버가 아닌 사람에게도 링크로 받는 투표. 스페이스와 무관한 개인 투표라 멤버 일정 조사와 따로 만든다. */}
          <ButtonLink href="/polls/new" variant="ghost" size="sm">링크 투표</ButtonLink>
          <MeetingCreate spaceId={spaceId} today={today} defaultOpen={query.new === "1"} defaultStart={start} />
        </div>
      </div>
      <MeetingList meetings={meetings} spaceId={spaceId} today={today} />
    </div>
  );
}
