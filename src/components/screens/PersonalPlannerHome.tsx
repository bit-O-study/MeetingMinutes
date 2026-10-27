import Link from "@/components/PendingLink";
import { CalendarDays, ChevronRight } from "lucide-react";
import { plannerSummary } from "@/lib/planner-data";
export async function PersonalPlannerHome() {
  const summary = await plannerSummary();
  return <section className="my-4 flex flex-wrap items-center gap-4 rounded-2xl border border-line bg-surface p-5"><CalendarDays className="size-8 text-accent" /><div className="min-w-0 flex-1"><h2 className="text-sm font-bold">나만의 플래너</h2><p className="mt-1 text-xs text-ink-2">오늘 일정 {summary.today}개 · 남은 할 일 {summary.open}개</p></div><div className="flex gap-3 text-xs font-bold text-accent"><Link href="/calendar" className="flex items-center">개인 일정<ChevronRight className="size-4" /></Link><Link href="/tasks" className="flex items-center">할 일<ChevronRight className="size-4" /></Link></div></section>;
}
