import Link from "@/components/PendingLink";
import { listIssues } from "@/lib/actions/issues";
import { listSpaceMeetings } from "@/lib/meeting-data";
import { ISSUE_STATUSES } from "@/lib/issue-labels";

/** 대화 옆 요약도 기존 권한 검사 액션으로 조회해 같은 프로젝트의 기록만 보여 준다. */
export async function ChatOverview({ spaceId }: { spaceId: string }) {
  const [meetings, issues] = await Promise.all([listSpaceMeetings(spaceId), listIssues(spaceId)]);
  const polling = meetings.filter(meeting => meeting.status === "polling").slice(0, 2);
  const openIssues = issues.rows.filter(issue => issue.status !== "closed").slice(0, 3);
  return <aside className="chat-overview">
    <section className="ui-card bg-surface p-5"><h2 className="mb-4 text-sm font-semibold">투표 중인 일정</h2>
      {polling.length ? polling.map(meeting => <Link key={meeting.id} href={`/s/${spaceId}/m/${meeting.id}`} className="mb-4 block last:mb-0"><strong className="block text-sm font-medium">{meeting.title}</strong><span className="mt-2 block text-xs text-ink-3">{meeting.windowStart.slice(5)} ~ {meeting.windowEnd.slice(5)}</span><span className="mt-3 inline-flex rounded-lg bg-accent-soft px-3 py-2 text-xs text-accent">{meeting.needsMyAnswer ? "응답하기" : "응답 보기"} · {meeting.responded}/{meeting.members}</span></Link>) : <p className="text-xs leading-6 text-ink-3">진행 중인 일정 투표가 없어요.</p>}
    </section>
    <section className="ui-card bg-surface p-5"><h2 className="mb-4 text-sm font-semibold">정리할 이슈</h2>
      {openIssues.length ? openIssues.map(issue => <Link key={issue.id} href={`/s/${spaceId}?tab=issues&issue=${issue.id}#issue-${issue.id}`} className="mb-4 flex items-start gap-2 last:mb-0"><span className="shrink-0 rounded-md bg-accent-soft px-2 py-1 text-[10px] text-accent">{ISSUE_STATUSES[issue.status]}</span><span className="text-xs leading-6">{issue.title}</span></Link>) : <p className="text-xs leading-6 text-ink-3">남은 이슈가 없어요.</p>}
    </section>
  </aside>;
}
