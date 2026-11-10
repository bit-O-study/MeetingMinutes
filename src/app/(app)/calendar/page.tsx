import { CalendarView } from "@/components/calendar/CalendarView";
import { isIsoDay, monthOf } from "@/lib/calendar-dates";
import { loadCalendarMonth, loadLinkTargets } from "@/lib/calendar-data";
import { todayInSeoul } from "@/lib/utils";

const MONTH = /^(20\d{2}|2100)-(0[1-9]|1[0-2])$/;

/**
 * 통합 캘린더. 개인 일정·할 일, 내가 속한 스페이스의 할 일, 확정·투표 중인 모임을 한 화면에 보여 준다.
 * 상태는 주소에 둔다: `?month=2026-11` 또는 `?view=week&day=2026-11-12`.
 */
export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const params = await searchParams;
  const today = todayInSeoul();
  const view = params.view === "week" ? "week" : "month";
  const dayParam = typeof params.day === "string" && isIsoDay(params.day) && MONTH.test(monthOf(params.day)) ? params.day : null;
  const monthParam = typeof params.month === "string" && MONTH.test(params.month) ? params.month : null;

  const anchorDay = view === "week" ? (dayParam ?? today) : monthParam ? (monthParam === monthOf(today) ? today : `${monthParam}-01`) : today;
  const month = view === "week" ? monthOf(anchorDay) : (monthParam ?? monthOf(today));

  const [data, linkTargets] = await Promise.all([loadCalendarMonth(month), loadLinkTargets()]);
  return <CalendarView key={`${view}-${anchorDay}`} data={data} linkTargets={linkTargets} view={view} anchorDay={anchorDay} />;
}
