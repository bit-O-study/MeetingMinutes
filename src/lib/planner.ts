import { z } from "zod";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(value + "T00:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && value >= "2000-01-01" && value <= "2100-12-31";
}, "날짜를 확인해 주세요.");
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const plannerInput = z.object({
  kind: z.enum(["event", "task"]), title: z.string().trim().min(1, "제목을 입력해 주세요.").max(160),
  memo: z.string().max(4000), mode: z.enum(["range", "fixed", "none"]),
  startDate: day.nullable(), endDate: day.nullable(), date: day.nullable(),
  from: time.nullable(), to: time.nullable(), allDay: z.boolean(),
}).strict().superRefine((value, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: "custom", message });
  if (value.kind === "event" && value.mode !== "fixed") issue("개인 일정의 날짜를 지정해 주세요.");
  if (value.mode === "range") {
    if (!value.endDate) issue("마감일을 선택해 주세요.");
    if (value.startDate && value.endDate && value.startDate > value.endDate) issue("마감일은 시작일보다 빠를 수 없어요.");
  }
  if (value.mode === "fixed") {
    if (!value.date) issue("날짜를 선택해 주세요.");
    if (!value.allDay && (!value.from || !value.to || value.from >= value.to)) issue("종료 시간을 시작 시간 이후로 선택해 주세요.");
  }
});
export type PlannerInput = z.infer<typeof plannerInput>;
export type PlannerItem = PlannerInput & { id: string; version: number; done: boolean };
export type PlannerSummary = { today: number; open: number; done: number };

export function plannerFields(input: PlannerInput) {
  return {
    kind: input.kind, title: input.title, memo: input.memo, mode: input.mode,
    startDate: input.mode === "range" ? input.startDate : null,
    endDate: input.mode === "range" ? input.endDate : null,
    scheduledDate: input.mode === "fixed" ? input.date : null,
    startsAt: input.mode === "fixed" && !input.allDay ? new Date(`${input.date}T${input.from}:00+09:00`) : null,
    endsAt: input.mode === "fixed" && !input.allDay ? new Date(`${input.date}T${input.to}:00+09:00`) : null,
    allDay: input.mode === "fixed" && input.allDay,
  };
}
export function occursOn(item: PlannerInput, date: string) {
  return item.mode === "fixed" ? item.date === date : item.mode === "range" && Boolean(item.endDate && date >= (item.startDate || item.endDate) && date <= item.endDate);
}
export function plannerOverdue(item: PlannerItem, today: string, now = Date.now()) {
  if (item.kind !== "task" || item.done || item.mode === "none") return false;
  if (item.mode === "range") return Boolean(item.endDate && item.endDate < today);
  if (item.allDay) return Boolean(item.date && item.date < today);
  return Boolean(item.date && item.to && new Date(`${item.date}T${item.to}:00+09:00`).getTime() < now);
}
export function plannerWhen(item: PlannerInput) {
  const short = (value: string | null) => value ? `${Number(value.slice(5, 7))}.${Number(value.slice(8, 10))}` : "";
  if (item.mode === "none") return "일정 미정";
  if (item.mode === "range") return item.startDate ? `${short(item.startDate)} – ${short(item.endDate)}` : `${short(item.endDate)}까지`;
  return `${short(item.date)} · ${item.allDay ? "종일" : `${item.from} – ${item.to}`}`;
}
export function monthWindow(month: string) {
  const valid = /^(20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(month);
  if (!valid) throw new Error("월을 확인해 주세요.");
  const first = new Date(`${month}-01T00:00:00Z`);
  const start = new Date(first); start.setUTCDate(1 - start.getUTCDay());
  const end = new Date(first); end.setUTCMonth(end.getUTCMonth() + 1, 0); end.setUTCDate(end.getUTCDate() + 6 - end.getUTCDay());
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}
