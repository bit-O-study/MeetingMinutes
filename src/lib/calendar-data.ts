import "server-only";

import { and, asc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";

import { listMySpaces } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { buildLayers, type CalendarEntry, type CalendarLayer, type LinkTarget } from "@/lib/calendar-entries";
import { meetingToEntry, plannerToEntry, spaceTaskToEntry, type MeetingRow } from "@/lib/calendar-map";
import { db } from "@/lib/db";
import { meetingResponses, meetings, notes, personalPlannerItems as items, spaceMembers, tasks } from "@/lib/db/schema";
import { monthWindow, type PlannerItem } from "@/lib/planner";
import { plannerItem } from "@/lib/planner-data";
import { todayInSeoul } from "@/lib/utils";

/** 한 달에 올리는 스페이스 할 일 상한. 이 이상은 화면에서도 읽을 수 없다. */
const SPACE_TASK_LIMIT = 400;

export type CalendarData = {
  layers: CalendarLayer[];
  entries: CalendarEntry[];
  /** 편집 창을 열 때 쓰는 내 개인 항목 원본(id 로 찾는다) */
  planner: PlannerItem[];
  today: string;
  month: string;
};

/**
 * 한 달 치 캘린더. 개인 일정·할 일, 내가 속한 스페이스의 할 일, 확정·투표 중인 모임을 한 모양으로 합친다.
 *
 * 스페이스 할 일은 나에게 배정됐거나 담당이 없는(공용) 것만 올린다. 남에게 배정된 것까지 섞으면
 * 칸이 금방 차서 정작 내 일정이 안 보인다.
 */
export async function loadCalendarMonth(month: string): Promise<CalendarData> {
  const user = await requireUser();
  const today = todayInSeoul();
  const range = monthWindow(month);
  const mySpaces = await listMySpaces();
  const spaceIds = mySpaces.map((row) => row.space.id);
  const layers = buildLayers(mySpaces.map((row) => ({ id: row.space.id, name: row.space.name })));

  const personalRows = await db
    .select()
    .from(items)
    .where(
      and(
        eq(items.ownerId, user.id),
        or(
          and(gte(items.scheduledDate, range.from), lte(items.scheduledDate, range.to)),
          and(gte(items.endDate, range.from), lte(sql`coalesce(${items.startDate}, ${items.endDate})`, range.to)),
        ),
      ),
    )
    .orderBy(asc(items.startsAt), asc(items.createdAt));

  const personal = personalRows.map(plannerItem);

  const [taskRows, meetingRows] = await Promise.all([
    spaceIds.length === 0
      ? []
      : db
          .select({ id: tasks.id, body: tasks.body, dueDate: tasks.dueDate, doneAt: tasks.doneAt, spaceId: tasks.spaceId, noteId: tasks.noteId, noteTitle: notes.title })
          .from(tasks)
          .innerJoin(notes, and(eq(notes.id, tasks.noteId), eq(notes.spaceId, tasks.spaceId)))
          .where(
            and(
              inArray(tasks.spaceId, spaceIds),
              isNull(notes.deletedAt),
              gte(tasks.dueDate, range.from),
              lte(tasks.dueDate, range.to),
              or(eq(tasks.assigneeId, user.id), isNull(tasks.assigneeId)),
            ),
          )
          .orderBy(asc(tasks.dueDate), asc(tasks.createdAt))
          .limit(SPACE_TASK_LIMIT),
    spaceIds.length === 0
      ? []
      : db
          .select()
          .from(meetings)
          .where(
            and(
              inArray(meetings.spaceId, spaceIds),
              or(
                and(eq(meetings.status, "confirmed"), lte(meetings.confirmedStart, range.to), gte(meetings.confirmedEnd, range.from)),
                and(eq(meetings.status, "polling"), lte(meetings.windowStart, range.to), gte(meetings.windowEnd, range.from)),
              ),
            ),
          ),
  ]);

  // 투표 중인 모임의 "응답 n/m명". 모임 수가 적어 두 번의 집계로 충분하다.
  const meetingIds = meetingRows.map((row) => row.id);
  const [respondedRows, memberRows] = await Promise.all([
    meetingIds.length === 0
      ? []
      : db
          .select({ meetingId: meetingResponses.meetingId, n: sql<number>`count(distinct ${meetingResponses.userId})::int` })
          .from(meetingResponses)
          .where(inArray(meetingResponses.meetingId, meetingIds))
          .groupBy(meetingResponses.meetingId),
    meetingRows.length === 0
      ? []
      : db
          .select({ spaceId: spaceMembers.spaceId, n: sql<number>`count(*)::int` })
          .from(spaceMembers)
          .where(inArray(spaceMembers.spaceId, [...new Set(meetingRows.map((row) => row.spaceId))]))
          .groupBy(spaceMembers.spaceId),
  ]);
  const responded = new Map(respondedRows.map((row) => [row.meetingId, row.n]));
  const memberCount = new Map(memberRows.map((row) => [row.spaceId, row.n]));

  // 할 일이 딸린 일정·모임의 제목(칩). 같은 달 안에 없는 일정도 있을 수 있어 id 로 따로 읽는다.
  const linkedItemIds = personal.map((item) => item.linkedItemId).filter((id): id is string => Boolean(id));
  const linkedMeetingIds = personal.map((item) => item.linkedMeetingId).filter((id): id is string => Boolean(id));
  const [linkedItems, linkedMeetings] = await Promise.all([
    linkedItemIds.length === 0
      ? []
      : db.select({ id: items.id, title: items.title }).from(items).where(and(eq(items.ownerId, user.id), inArray(items.id, linkedItemIds))),
    linkedMeetingIds.length === 0 || spaceIds.length === 0
      ? []
      : db.select({ id: meetings.id, title: meetings.title }).from(meetings).where(and(inArray(meetings.spaceId, spaceIds), inArray(meetings.id, linkedMeetingIds))),
  ]);
  const linkTitles = new Map<string, string>([...linkedItems, ...linkedMeetings].map((row) => [row.id, row.title]));

  const entries: CalendarEntry[] = [];
  for (const item of personal) {
    const entry = plannerToEntry(item, today, linkTitles);
    if (entry) entries.push(entry);
  }
  for (const row of taskRows) {
    if (row.dueDate) entries.push(spaceTaskToEntry({ ...row, dueDate: row.dueDate }, today));
  }
  for (const row of meetingRows) {
    const meetingRow: MeetingRow = {
      id: row.id,
      spaceId: row.spaceId,
      title: row.title,
      status: row.status,
      windowStart: row.windowStart,
      windowEnd: row.windowEnd,
      confirmedStart: row.confirmedStart,
      confirmedEnd: row.confirmedEnd,
      confirmedFrom: row.confirmedFrom,
      confirmedTo: row.confirmedTo,
      responded: responded.get(row.id) ?? 0,
      members: memberCount.get(row.spaceId) ?? 0,
    };
    const entry = meetingToEntry(meetingRow);
    if (entry) entries.push(entry);
  }
  return { layers, entries, planner: personal, today, month };
}

/**
 * 할 일을 딸리게 할 수 있는 일정·모임 후보. 지난 지 오래된 것은 뺀다(고르는 목록이 길어지지 않게).
 */
export async function loadLinkTargets(): Promise<LinkTarget[]> {
  const user = await requireUser();
  const today = todayInSeoul();
  const mySpaces = await listMySpaces();
  const spaceIds = mySpaces.map((row) => row.space.id);
  const [events, upcoming] = await Promise.all([
    db
      .select()
      .from(items)
      .where(and(eq(items.ownerId, user.id), eq(items.kind, "event"), or(gte(items.scheduledDate, today), gte(items.endDate, today))))
      .orderBy(asc(sql`coalesce(${items.scheduledDate}, ${items.startDate})`))
      .limit(30),
    spaceIds.length === 0
      ? []
      : db
          .select()
          .from(meetings)
          .where(and(inArray(meetings.spaceId, spaceIds), eq(meetings.status, "confirmed"), gte(meetings.confirmedEnd, today)))
          .orderBy(asc(meetings.confirmedStart))
          .limit(30),
  ]);
  const label = (a: string | null, b?: string | null) => (a ? (b && b !== a ? `${a.slice(5).replace("-", "/")}~${b.slice(5).replace("-", "/")}` : a.slice(5).replace("-", "/")) : "");
  return [
    ...events.map((row): LinkTarget => ({ kind: "event", id: row.id, title: row.title, when: label(row.scheduledDate ?? row.startDate, row.endDate) })),
    ...upcoming.map((row): LinkTarget => ({ kind: "meeting", id: row.id, title: row.title, when: label(row.confirmedStart, row.confirmedEnd) })),
  ];
}
