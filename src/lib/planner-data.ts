import "server-only";
import { and, asc, count, desc, eq, gte, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { personalPlannerItems as items } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { monthWindow, type PlannerItem } from "@/lib/planner";
import { todayInSeoul } from "@/lib/utils";

export function plannerItem(row: typeof items.$inferSelect): PlannerItem {
  const time = (value: Date | null) => value ? new Date(value.getTime() + 9 * 3600000).toISOString().slice(11, 16) : null;
  return { id: row.id, version: row.version, kind: row.kind, title: row.title, memo: row.memo, mode: row.mode,
    startDate: row.startDate, endDate: row.endDate, date: row.scheduledDate, from: time(row.startsAt), to: time(row.endsAt), allDay: row.allDay, done: Boolean(row.doneAt) };
}
export async function plannerSummary() {
  const user = await requireUser(); const today = todayInSeoul();
  const [row] = await db.select({
    today: sql<number>`count(*) filter (where ${items.doneAt} is null and (${items.scheduledDate} = ${today}::date or (${items.endDate} >= ${today}::date and coalesce(${items.startDate}, ${items.endDate}) <= ${today}::date)))::int`,
    open: sql<number>`count(*) filter (where ${items.kind} = 'task' and ${items.doneAt} is null)::int`,
    done: sql<number>`count(*) filter (where ${items.kind} = 'task' and ${items.doneAt} is not null)::int`,
  }).from(items).where(eq(items.ownerId, user.id));
  return row ?? { today: 0, open: 0, done: 0 };
}
export async function calendarItems(month: string) {
  const user = await requireUser(); const range = monthWindow(month);
  const rows = await db.select().from(items).where(and(eq(items.ownerId, user.id), or(
    and(gte(items.scheduledDate, range.from), lte(items.scheduledDate, range.to)),
    and(gte(items.endDate, range.from), lte(sql`coalesce(${items.startDate}, ${items.endDate})`, range.to)),
  ))).orderBy(asc(items.startsAt), asc(items.createdAt));
  return rows.map(plannerItem);
}
export async function personalTaskItems(status: "open" | "done" | "all", page: number) {
  const user = await requireUser();
  const condition = and(eq(items.ownerId, user.id), eq(items.kind, "task"), status === "open" ? isNull(items.doneAt) : status === "done" ? isNotNull(items.doneAt) : undefined);
  const [rows, [total]] = await Promise.all([
    db.select().from(items).where(condition).orderBy(asc(items.doneAt), asc(sql`coalesce(${items.endDate},${items.scheduledDate})`), desc(items.updatedAt), asc(items.id)).limit(50).offset((page - 1) * 50),
    db.select({ n: count() }).from(items).where(condition),
  ]);
  return { items: rows.map(plannerItem), total: total.n };
}
