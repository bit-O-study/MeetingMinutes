import Link from "@/components/PendingLink";
import { ISSUE_STATUSES } from "@/lib/issue-input";
import type { issues } from "@/lib/db/schema";

export function AssignedIssueRow({ issue, spaceName }: { issue: typeof issues.$inferSelect; spaceName: string }) {
  return <li className="min-w-0">
    <Link href={`/s/${issue.spaceId}?tab=issues&issue=${issue.id}#issue-${issue.id}`}
      className="flex min-h-11 items-start gap-3 rounded-xl px-3 py-3 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent">
      <div className="min-w-0 flex-1">
        <p className="break-words text-sm font-semibold text-ink">{issue.title}</p>
        <p className="mt-1 break-words text-xs text-ink-3">{spaceName} · 이슈</p>
      </div>
      <span className="shrink-0 rounded-full bg-accent-soft px-2 py-1 text-xs font-bold text-accent">{ISSUE_STATUSES[issue.status]}</span>
    </Link>
  </li>;
}
