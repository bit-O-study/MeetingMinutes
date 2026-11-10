import "server-only";

import { and, asc, desc, eq, gte, inArray, lte, or, sql } from "drizzle-orm";

import { requireSpaceMember } from "@/lib/access";
import { eachDay } from "@/lib/calendar-dates";
import { db } from "@/lib/db";
import { meetingResponses, meetings, personalPlannerItems as items, spaceMembers, users } from "@/lib/db/schema";
import type { Votes } from "@/lib/meetings";

export type MeetingSummary = {
  id: string;
  title: string;
  location: string;
  status: "polling" | "confirmed" | "cancelled";
  spanDays: number;
  windowStart: string;
  windowEnd: string;
  confirmedStart: string | null;
  confirmedEnd: string | null;
  confirmedFrom: string | null;
  confirmedTo: string | null;
  respondBy: string | null;
  responded: number;
  members: number;
  /** 내가 아직 한 날도 답하지 않았는가 — "응답 대기" 표시에 쓴다 */
  needsMyAnswer: boolean;
};

/** 스페이스의 모임 목록: 투표 중 → 확정(앞으로) → 지난 확정 순. 취소된 것은 뺀다. */
export async function listSpaceMeetings(spaceId: string): Promise<MeetingSummary[]> {
  const { userId } = await requireSpaceMember(spaceId);
  const rows = await db
    .select()
    .from(meetings)
    .where(and(eq(meetings.spaceId, spaceId), or(eq(meetings.status, "polling"), eq(meetings.status, "confirmed"))))
    .orderBy(desc(meetings.createdAt))
    .limit(100);
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const [[memberTotal], perMeeting, mine] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(spaceMembers).where(eq(spaceMembers.spaceId, spaceId)),
    db
      .select({ meetingId: meetingResponses.meetingId, n: sql<number>`count(distinct ${meetingResponses.userId})::int` })
      .from(meetingResponses)
      .where(inArray(meetingResponses.meetingId, ids))
      .groupBy(meetingResponses.meetingId),
    db
      .select({ meetingId: meetingResponses.meetingId })
      .from(meetingResponses)
      .where(and(inArray(meetingResponses.meetingId, ids), eq(meetingResponses.userId, userId)))
      .groupBy(meetingResponses.meetingId),
  ]);
  const responded = new Map(perMeeting.map((row) => [row.meetingId, row.n]));
  const answeredByMe = new Set(mine.map((row) => row.meetingId));
  const summaries = rows.map((row): MeetingSummary => ({
    id: row.id,
    title: row.title,
    location: row.location,
    status: row.status,
    spanDays: row.spanDays,
    windowStart: row.windowStart,
    windowEnd: row.windowEnd,
    confirmedStart: row.confirmedStart,
    confirmedEnd: row.confirmedEnd,
    confirmedFrom: row.confirmedFrom,
    confirmedTo: row.confirmedTo,
    respondBy: row.respondBy ? row.respondBy.toISOString() : null,
    responded: responded.get(row.id) ?? 0,
    members: memberTotal?.n ?? 0,
    needsMyAnswer: row.status === "polling" && !answeredByMe.has(row.id),
  }));
  const rank = (m: MeetingSummary) => (m.status === "polling" ? 0 : 1);
  return summaries.sort((a, b) => rank(a) - rank(b));
}

export type MeetingMember = { id: string; name: string };

export type MeetingDetail = {
  meeting: MeetingSummary & { memo: string; createdBy: string | null; noteId: string | null; version: number };
  members: MeetingMember[];
  votes: Votes;
  myUserId: string;
  /** 확정·취소·다시 열기를 할 수 있는가: 만든 사람 또는 스페이스 소유자 */
  canManage: boolean;
  /** 내 개인 일정과 겹치는 후보 날짜 → 일정 제목들. 나에게만 보내는 값이다. */
  busy: Record<string, string[]>;
};

/** 모임 한 건과 응답 전체. 권한 없음과 없는 모임을 구분하지 않는다(null 이면 호출부가 notFound). */
export async function getMeetingDetail(spaceId: string, meetingId: string): Promise<MeetingDetail | null> {
  const { userId, role } = await requireSpaceMember(spaceId);
  const [row] = await db.select().from(meetings).where(and(eq(meetings.id, meetingId), eq(meetings.spaceId, spaceId))).limit(1);
  if (!row) return null;

  const [memberRows, responseRows, personal] = await Promise.all([
    db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(spaceMembers)
      .innerJoin(users, eq(users.id, spaceMembers.userId))
      .where(eq(spaceMembers.spaceId, spaceId))
      .orderBy(asc(spaceMembers.joinedAt)),
    db.select().from(meetingResponses).where(eq(meetingResponses.meetingId, meetingId)),
    // 내 개인 일정(일정만) 중 후보 기간과 겹치는 것. 응답 화면에서 나에게만 "겹침"을 알려 준다.
    db
      .select()
      .from(items)
      .where(
        and(
          eq(items.ownerId, userId),
          eq(items.kind, "event"),
          or(
            and(gte(items.scheduledDate, row.windowStart), lte(items.scheduledDate, row.windowEnd)),
            and(lte(items.startDate, row.windowEnd), gte(items.endDate, row.windowStart)),
          ),
        ),
      ),
  ]);

  const members = memberRows.map((m): MeetingMember => ({ id: m.id, name: m.name?.trim() || m.email.split("@")[0] }));
  const memberIds = new Set(members.map((m) => m.id));
  const votes: Votes = {};
  for (const response of responseRows) {
    // 떠난 멤버의 응답은 남아 있어도 집계에서 뺀다.
    if (!memberIds.has(response.userId)) continue;
    (votes[response.day] ??= {})[response.userId] = response.answer;
  }
  const respondedUsers = new Set(Object.values(votes).flatMap((byUser) => Object.keys(byUser)));

  const busy: Record<string, string[]> = {};
  const windowDays = new Set(eachDay(row.windowStart, row.windowEnd));
  for (const item of personal) {
    const start = item.scheduledDate ?? item.startDate;
    const end = item.scheduledDate ?? item.endDate;
    if (!start || !end) continue;
    for (const dayKey of eachDay(start, end)) if (windowDays.has(dayKey)) (busy[dayKey] ??= []).push(item.title);
  }

  return {
    meeting: {
      id: row.id,
      title: row.title,
      location: row.location,
      memo: row.memo,
      status: row.status,
      spanDays: row.spanDays,
      windowStart: row.windowStart,
      windowEnd: row.windowEnd,
      confirmedStart: row.confirmedStart,
      confirmedEnd: row.confirmedEnd,
      confirmedFrom: row.confirmedFrom,
      confirmedTo: row.confirmedTo,
      respondBy: row.respondBy ? row.respondBy.toISOString() : null,
      responded: respondedUsers.size,
      members: members.length,
      needsMyAnswer: row.status === "polling" && !respondedUsers.has(userId),
      createdBy: row.createdBy,
      noteId: row.noteId,
      version: row.version,
    },
    members,
    votes,
    myUserId: userId,
    canManage: role === "owner" || row.createdBy === userId,
    busy,
  };
}

/** 내가 속한 모든 스페이스에서 아직 답하지 않은 투표 수. 내비게이션 배지용. */
export async function countMyPendingMeetings(spaceIds: string[], userId: string): Promise<number> {
  if (spaceIds.length === 0) return 0;
  const polling = await db
    .select({ id: meetings.id })
    .from(meetings)
    .where(and(inArray(meetings.spaceId, spaceIds), eq(meetings.status, "polling")));
  if (polling.length === 0) return 0;
  const answered = await db
    .select({ meetingId: meetingResponses.meetingId })
    .from(meetingResponses)
    .where(and(inArray(meetingResponses.meetingId, polling.map((row) => row.id)), eq(meetingResponses.userId, userId)))
    .groupBy(meetingResponses.meetingId);
  return polling.length - answered.length;
}
