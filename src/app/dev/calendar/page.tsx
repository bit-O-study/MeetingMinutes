import { notFound } from "next/navigation";

import { CalendarView } from "@/components/calendar/CalendarView";
import { isIsoDay, monthOf } from "@/lib/calendar-dates";

import { PREVIEW_LINK_TARGETS, PREVIEW_TODAY, previewCalendar } from "../fixtures";

/** 개발 전용: DB·로그인 없이 캘린더 화면을 그린다. 운영 빌드에서는 열리지 않는다. */
export default async function PreviewCalendarPage({ searchParams }: PageProps<"/dev/calendar">) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const view = params.view === "week" ? "week" : "month";
  const dayParam = typeof params.day === "string" && isIsoDay(params.day) ? params.day : null;
  const monthParam = typeof params.month === "string" && /^20\d{2}-(0[1-9]|1[0-2])$/.test(params.month) ? params.month : null;
  const anchorDay = view === "week" ? (dayParam ?? PREVIEW_TODAY) : monthParam ? `${monthParam}-01` : PREVIEW_TODAY;
  const month = view === "week" ? monthOf(anchorDay) : (monthParam ?? monthOf(PREVIEW_TODAY));
  return <CalendarView key={`${view}-${anchorDay}`} data={previewCalendar(month)} linkTargets={PREVIEW_LINK_TARGETS} view={view} anchorDay={anchorDay} preview />;
}
