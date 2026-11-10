import Link from "@/components/PendingLink";

import { dayRangeLabel } from "@/lib/calendar-dates";
import type { MeetingSummary } from "@/lib/meeting-data";
import { cn } from "@/lib/utils";

function when(m: MeetingSummary): string {
  if (m.status === "confirmed" && m.confirmedStart && m.confirmedEnd) {
    return `${dayRangeLabel(m.confirmedStart, m.confirmedEnd)}${m.confirmedFrom && m.confirmedTo ? ` ${m.confirmedFrom}–${m.confirmedTo}` : ""}`;
  }
  return `후보 ${dayRangeLabel(m.windowStart, m.windowEnd)}${m.spanDays > 1 ? ` · 연속 ${m.spanDays}일` : ""}`;
}

function Card({ meeting, spaceId, today }: { meeting: MeetingSummary; spaceId: string; today: string }) {
  const past = meeting.status === "confirmed" && (meeting.confirmedEnd ?? "") < today;
  return (
    <li>
      <Link
        href={`/s/${spaceId}/m/${meeting.id}`}
        className={cn("flex min-w-0 flex-col gap-1.5 rounded-2xl bg-surface p-4 ring-1 ring-line hover:bg-surface-2", past && "opacity-60")}
      >
        <span className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 text-base font-black [overflow-wrap:anywhere]">{meeting.title}</span>
          {meeting.needsMyAnswer && <span className="rounded-full bg-warn-soft px-2 py-0.5 text-xs font-bold text-warn">내 응답 필요</span>}
          {meeting.status === "confirmed" && <span className="rounded-full bg-ok-soft px-2 py-0.5 text-xs font-bold text-ok">{past ? "지난 모임" : "확정"}</span>}
        </span>
        <span className="text-sm text-ink-2">{when(meeting)}</span>
        <span className="flex flex-wrap gap-x-3 text-[13px] text-ink-3">
          {meeting.location && <span className="[overflow-wrap:anywhere]">장소 {meeting.location}</span>}
          {meeting.status === "polling" && <span>응답 {meeting.responded}/{meeting.members}명</span>}
        </span>
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
      <div className="rounded-2xl border-2 border-dashed border-line-2 bg-surface px-6 py-10 text-center">
        <p className="text-base font-black">아직 잡은 일정이 없어요</p>
        <p className="mt-1 text-sm text-ink-2">후보 날짜를 정하면 멤버가 가능한 날을 칠하고, 가장 맞는 날을 골라 확정할 수 있어요.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-5">
      {polling.length > 0 && (
        <section aria-label="투표 중인 일정">
          <h2 className="mb-2 text-sm font-black text-ink-2">투표 중 <span className="font-mono text-xs text-ink-3">{polling.length}</span></h2>
          <ul className="grid gap-2.5 md:grid-cols-2">{polling.map((m) => <Card key={m.id} meeting={m} spaceId={spaceId} today={today} />)}</ul>
        </section>
      )}
      {confirmed.length > 0 && (
        <section aria-label="확정된 일정">
          <h2 className="mb-2 text-sm font-black text-ink-2">확정 <span className="font-mono text-xs text-ink-3">{confirmed.length}</span></h2>
          <ul className="grid gap-2.5 md:grid-cols-2">{confirmed.map((m) => <Card key={m.id} meeting={m} spaceId={spaceId} today={today} />)}</ul>
        </section>
      )}
    </div>
  );
}
