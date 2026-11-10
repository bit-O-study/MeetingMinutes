import Link from "@/components/PendingLink";
import { Check, MapPin, Vote } from "lucide-react";

import { dayRangeLabel, weekdayLabel } from "@/lib/calendar-dates";
import type { MeetingSummary } from "@/lib/meeting-data";
import { cn } from "@/lib/utils";

function when(m: MeetingSummary): string {
  if (m.status === "confirmed" && m.confirmedStart && m.confirmedEnd) {
    return `${dayRangeLabel(m.confirmedStart, m.confirmedEnd)}${m.confirmedFrom && m.confirmedTo ? ` ${m.confirmedFrom}–${m.confirmedTo}` : ""}`;
  }
  return dayRangeLabel(m.windowStart, m.windowEnd);
}

/** 응답 현황을 숫자 대신 고리로 보인다. 가운데는 응답한 사람 수. */
function ProgressRing({ done, total }: { done: number; total: number }) {
  const radius = 16;
  const circumference = 2 * Math.PI * radius;
  const ratio = total > 0 ? Math.min(1, done / total) : 0;
  return (
    <span role="img" aria-label={`응답 ${done}/${total}명`} className="relative grid size-11 shrink-0 place-items-center">
      <svg viewBox="0 0 40 40" className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx="20" cy="20" r={radius} fill="none" strokeWidth="4" className="stroke-surface-2" />
        <circle cx="20" cy="20" r={radius} fill="none" strokeWidth="4" strokeLinecap="round" className="stroke-accent" strokeDasharray={`${circumference * ratio} ${circumference}`} />
      </svg>
      <span aria-hidden="true" className="text-xs font-black tabular-nums">{done}</span>
    </span>
  );
}

function DateBadge({ meeting }: { meeting: MeetingSummary }) {
  if (meeting.status === "confirmed" && meeting.confirmedStart) {
    return (
      <span aria-hidden="true" className="grid size-14 shrink-0 place-items-center rounded-2xl bg-[color-mix(in_srgb,var(--ok)_16%,var(--surface))] text-center leading-none">
        <span>
          <span className="block text-[11px] font-bold text-ok">{Number(meeting.confirmedStart.slice(5, 7))}월 {weekdayLabel(meeting.confirmedStart)}</span>
          <span className="mt-1 block text-[1.45rem] font-black tabular-nums">{Number(meeting.confirmedStart.slice(8))}</span>
        </span>
      </span>
    );
  }
  return (
    <span aria-hidden="true" className="grid size-14 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent">
      <Vote className="size-6" strokeWidth={2} />
    </span>
  );
}

function Card({ meeting, spaceId, today }: { meeting: MeetingSummary; spaceId: string; today: string }) {
  const past = meeting.status === "confirmed" && (meeting.confirmedEnd ?? "") < today;
  return (
    <li>
      <Link
        href={`/s/${spaceId}/m/${meeting.id}`}
        className={cn("relative flex min-w-0 items-center gap-3.5 rounded-3xl bg-surface p-3.5 shadow-sm transition-shadow hover:shadow-md", past && "opacity-55")}
      >
        <DateBadge meeting={meeting} />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex items-start gap-2">
            {meeting.needsMyAnswer && (
              <span role="img" aria-label="내 응답 필요" className="relative mt-[0.45rem] grid size-3 shrink-0 place-items-center">
                <span aria-hidden="true" className="absolute size-3 animate-ping rounded-full bg-warn/60 motion-reduce:hidden" />
                <span aria-hidden="true" className="relative size-2.5 rounded-full bg-warn" />
              </span>
            )}
            <span className="text-base font-black leading-snug [overflow-wrap:anywhere]">{meeting.title}</span>
          </span>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] font-semibold text-ink-2">
            <span>{when(meeting)}{meeting.status === "polling" && meeting.spanDays > 1 && <span className="ml-1.5 rounded-full bg-surface-2 px-1.5 py-0.5 text-[11px] font-black">{meeting.spanDays}일</span>}</span>
            {meeting.location && <span className="inline-flex min-w-0 items-center gap-1 [overflow-wrap:anywhere]"><MapPin aria-hidden="true" className="size-3.5 shrink-0 text-ink-3" /><span className="sr-only">장소 </span>{meeting.location}</span>}
          </span>
        </span>
        {meeting.status === "polling" ? (
          <ProgressRing done={meeting.responded} total={meeting.members} />
        ) : (
          <span role="img" aria-label={past ? "지난 모임" : "확정"} className="grid size-9 shrink-0 place-items-center rounded-full bg-ok text-white"><Check aria-hidden="true" className="size-5" strokeWidth={3} /></span>
        )}
      </Link>
    </li>
  );
}

/** 스페이스의 모임 목록: 투표 중 → 확정된 모임. 취소된 모임은 목록에서 빠진다. */
export function MeetingList({ meetings, spaceId, today }: { meetings: MeetingSummary[]; spaceId: string; today: string }) {
  const polling = meetings.filter((m) => m.status === "polling");
  const confirmed = meetings.filter((m) => m.status === "confirmed");
  if (meetings.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-3xl bg-surface py-14 text-ink-3 shadow-sm">
        <span aria-hidden="true" className="grid size-16 place-items-center rounded-full bg-accent-soft text-accent"><Vote className="size-8" strokeWidth={1.75} /></span>
        <p className="text-base font-black text-ink-2">아직 잡은 일정이 없어요</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      {polling.length > 0 && (
        <section aria-label="투표 중인 일정" className="flex flex-col gap-2.5">
          <h2 className="flex items-center gap-2 px-1 text-sm font-black text-ink-2"><Vote aria-hidden="true" className="size-4" />투표 중<span className="grid size-5 place-items-center rounded-full bg-surface-2 text-xs tabular-nums">{polling.length}</span></h2>
          <ul className="grid gap-3 md:grid-cols-2">{polling.map((m) => <Card key={m.id} meeting={m} spaceId={spaceId} today={today} />)}</ul>
        </section>
      )}
      {confirmed.length > 0 && (
        <section aria-label="확정된 일정" className="flex flex-col gap-2.5">
          <h2 className="flex items-center gap-2 px-1 text-sm font-black text-ink-2"><Check aria-hidden="true" className="size-4" strokeWidth={3} />확정<span className="grid size-5 place-items-center rounded-full bg-surface-2 text-xs tabular-nums">{confirmed.length}</span></h2>
          <ul className="grid gap-3 md:grid-cols-2">{confirmed.map((m) => <Card key={m.id} meeting={m} spaceId={spaceId} today={today} />)}</ul>
        </section>
      )}
    </div>
  );
}
