import Link from "@/components/PendingLink";
import { CalendarDays, ChevronRight } from "lucide-react";
import { plannerSummary } from "@/lib/planner-data";
export async function PersonalPlannerHome() {
  const summary = await plannerSummary();
  return <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent"><CalendarDays className="size-5" /></span><div className="min-w-0 flex-1"><h2 className="text-sm font-medium">오늘의 일정</h2><p className="mt-1 text-xs leading-relaxed text-ink-2">일정 {summary.today}개 · 남은 할 일 {summary.open}개</p></div><div className="flex gap-2 text-xs font-medium text-accent"><Link href="/calendar" className="flex min-h-11 items-center px-1">일정<ChevronRight className="size-4" /></Link><Link href="/tasks" className="flex min-h-11 items-center px-1">할 일<ChevronRight className="size-4" /></Link></div></section>;
}
