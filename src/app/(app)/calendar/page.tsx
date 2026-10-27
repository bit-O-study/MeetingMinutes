import { PlannerScreen } from "@/components/screens/PlannerScreen";
import { calendarItems, plannerSummary } from "@/lib/planner-data";
import { todayInSeoul } from "@/lib/utils";
export default async function CalendarPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const today = todayInSeoul();
  const month = typeof params.month === "string" && /^(20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(params.month) ? params.month : today.slice(0, 7);
  const [items, summary] = await Promise.all([calendarItems(month), plannerSummary()]);
  return <PlannerScreen key={month} view="calendar" items={items} summary={summary} month={month} today={today} />;
}
