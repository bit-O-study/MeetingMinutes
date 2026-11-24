import { CalendarCheck, Plus } from "lucide-react";

import Link from "@/components/PendingLink";
import { ButtonLink } from "@/components/ui/Button";
import { dayLabel, deadlineLabel } from "@/lib/poll-format";
import { listMyPolls } from "@/lib/poll-data";
import { cn } from "@/lib/utils";

/** 내가 만든 일정 투표. 링크로 받은 투표에 참여만 한 사람의 것은 여기 나오지 않는다. */
export default async function PollsPage() {
  const polls = await listMyPolls();
  return (
    <div className="workspace-page">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="page-title">일정 투표</h1>
          <p className="mt-2 text-sm text-ink-2">링크를 보내 로그인 없이 날짜를 모아요.</p>
        </div>
        <ButtonLink href="/polls/new" variant="secondary" size="sm"><Plus size={17} />새 투표</ButtonLink>
      </header>

      {polls.length === 0 ? (
        <div className="mt-10 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line-2 px-6 py-14 text-center">
          <CalendarCheck className="size-8 text-ink-3" aria-hidden />
          <p className="text-base font-semibold text-ink">아직 만든 투표가 없어요</p>
          <p className="max-w-xs text-sm text-ink-2">후보 기간을 정하고 링크를 공유하면, 받은 사람이 안 되는 날을 체크해요.</p>
          <ButtonLink href="/polls/new">첫 투표 만들기</ButtonLink>
        </div>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {polls.map((poll) => {
            const confirmed = poll.status === "confirmed";
            const label = confirmed && poll.confirmedDay ? `확정 ${dayLabel(poll.confirmedDay)}` : poll.closed ? "마감" : "진행 중";
            const tone = confirmed ? "bg-accent-soft text-accent" : poll.closed ? "bg-surface-2 text-ink-2" : "bg-ok-soft text-ok";
            return (
              <li key={poll.id}>
                <Link href={`/polls/${poll.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-line bg-surface p-4 hover:bg-surface-2">
                  <div className="min-w-0 flex-1">
                    <strong className="block truncate text-base text-ink">{poll.title}</strong>
                    <span className="text-sm text-ink-2">
                      {dayLabel(poll.rangeStart)} ~ {dayLabel(poll.rangeEnd)}
                      {poll.respondBy && !confirmed && !poll.closed ? ` · ${deadlineLabel(poll.respondBy)} 마감` : ""}
                    </span>
                  </div>
                  <span className="text-sm text-ink-2">{poll.participants}명 참여</span>
                  <span className={cn("rounded-full px-3 py-0.5 text-[13px] font-bold", tone)}>{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
