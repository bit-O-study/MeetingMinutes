"use server";

import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { requireSpaceMember, type SpaceAccess } from "@/lib/access";
import { dayRangeLabel, shortDay } from "@/lib/calendar-dates";
import { db } from "@/lib/db";
import { meetingResponses, meetings, noteDocs, notes, projectMessages, spaceMembers, spaces, users } from "@/lib/db/schema";
import { confirmedEnd, confirmInput, lastStartDay, meetingInput, rankWindows, responsesInput, type Votes } from "@/lib/meetings";
import { TEMPLATES, buildTemplateDoc, defaultTemplateFor, docToPlainText } from "@/lib/templates";
import { todayInSeoul } from "@/lib/utils";

export type MeetingResult = { ok: true; id?: string; message?: string } | { ok: false; message: string };

/** 한 스페이스에서 동시에 열어 둘 수 있는 투표 수. 응답할 사람이 지치지 않게 한다. */
const MAX_OPEN_POLLS = 20;
const NOT_FOUND: MeetingResult = { ok: false, message: "모임을 찾을 수 없습니다." };
const FORBIDDEN: MeetingResult = { ok: false, message: "만든 사람이나 스페이스 소유자만 할 수 있어요." };

type MeetingRow = typeof meetings.$inferSelect;

/** 모임을 읽고 그 스페이스의 멤버인지 확인한다. 없는 모임과 권한 없는 모임은 같은 응답이다. */
async function loadForMember(meetingId: string): Promise<{ meeting: MeetingRow; access: SpaceAccess } | null> {
  const [meeting] = await db.select().from(meetings).where(eq(meetings.id, meetingId)).limit(1);
  if (!meeting) return null;
  const access = await requireSpaceMember(meeting.spaceId);
  return { meeting, access };
}

function canManage(meeting: MeetingRow, access: SpaceAccess): boolean {
  return access.role === "owner" || meeting.createdBy === access.userId;
}

/** 채팅에 남기는 안내. 알림 기능이 없는 동안 멤버에게 소식을 전하는 유일한 길이다. */
async function postChat(spaceId: string, userId: string, body: string, tx: Pick<typeof db, "insert" | "update"> = db) {
  await tx.insert(projectMessages).values({ id: crypto.randomUUID(), spaceId, body, createdBy: userId });
  await tx.update(spaces).set({ lastActivityAt: new Date() }).where(eq(spaces.id, spaceId));
}

function revalidateMeeting(spaceId: string, meetingId?: string) {
  revalidatePath(`/s/${spaceId}`);
  if (meetingId) revalidatePath(`/s/${spaceId}/m/${meetingId}`);
  revalidatePath("/calendar");
}

export async function createMeeting(input: unknown): Promise<MeetingResult> {
  const parsed = meetingInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const data = parsed.data;
  const { userId } = await requireSpaceMember(data.spaceId);
  if (data.windowEnd < todayInSeoul()) return { ok: false, message: "이미 지난 날짜로는 후보를 만들 수 없어요." };

  const [open] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(meetings)
    .where(and(eq(meetings.spaceId, data.spaceId), eq(meetings.status, "polling")));
  if ((open?.n ?? 0) >= MAX_OPEN_POLLS) return { ok: false, message: `진행 중인 일정 조사는 ${MAX_OPEN_POLLS}개까지예요. 끝난 조사를 먼저 확정하거나 취소해 주세요.` };

  const created = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(meetings)
      .values({
        spaceId: data.spaceId,
        title: data.title,
        location: data.location,
        memo: data.memo,
        spanDays: data.spanDays,
        windowStart: data.windowStart,
        windowEnd: data.windowEnd,
        respondBy: data.respondBy ? new Date(data.respondBy) : null,
        createdBy: userId,
      })
      .returning({ id: meetings.id });
    const span = data.spanDays > 1 ? ` · 연속 ${data.spanDays}일` : "";
    await postChat(data.spaceId, userId, `[일정 조사] ${data.title}\n후보 ${dayRangeLabel(data.windowStart, data.windowEnd)}${span}\n가능한 날을 칠해 주세요: /s/${data.spaceId}/m/${row.id}`, tx);
    return row;
  });
  revalidateMeeting(data.spaceId, created.id);
  return { ok: true, id: created.id };
}

/** 내 응답만 저장한다. userId 는 입력으로 받지 않고 세션에서 읽는다. */
export async function setMeetingResponses(input: unknown): Promise<MeetingResult> {
  const parsed = responsesInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: "응답을 확인해 주세요." };
  const loaded = await loadForMember(parsed.data.meetingId);
  if (!loaded) return NOT_FOUND;
  const { meeting, access } = loaded;
  if (meeting.status !== "polling") return { ok: false, message: "이미 확정되었거나 취소된 모임이라 응답할 수 없어요." };

  const outside = parsed.data.answers.find((a) => a.day < meeting.windowStart || a.day > meeting.windowEnd);
  if (outside) return { ok: false, message: "후보 기간 밖의 날짜가 있어요." };

  const toSet = parsed.data.answers.filter((a) => a.answer !== null);
  const toClear = parsed.data.answers.filter((a) => a.answer === null).map((a) => a.day);
  await db.transaction(async (tx) => {
    if (toSet.length > 0) {
      await tx
        .insert(meetingResponses)
        .values(toSet.map((a) => ({ meetingId: meeting.id, day: a.day, userId: access.userId, answer: a.answer! })))
        .onConflictDoUpdate({
          target: [meetingResponses.meetingId, meetingResponses.day, meetingResponses.userId],
          set: { answer: sql`excluded.answer`, updatedAt: new Date() },
        });
    }
    if (toClear.length > 0) {
      await tx
        .delete(meetingResponses)
        .where(and(eq(meetingResponses.meetingId, meeting.id), eq(meetingResponses.userId, access.userId), inArray(meetingResponses.day, toClear)));
    }
  });
  revalidateMeeting(meeting.spaceId, meeting.id);
  return { ok: true };
}

/**
 * 확정. 동시에 두 사람이 눌러도 `status = 'polling'` 조건의 UPDATE 가 한 번만 성공한다.
 * 확정과 채팅 공지, 회의록 노트 생성은 한 트랜잭션이라 중간 상태가 남지 않는다.
 */
export async function confirmMeeting(input: unknown): Promise<MeetingResult> {
  const parsed = confirmInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const loaded = await loadForMember(parsed.data.meetingId);
  if (!loaded) return NOT_FOUND;
  const { meeting, access } = loaded;
  if (!canManage(meeting, access)) return FORBIDDEN;
  if (meeting.status !== "polling") return { ok: false, message: "이미 확정되었거나 취소된 모임이에요." };

  const { start, from, to, createNote } = parsed.data;
  if (start < meeting.windowStart || start > lastStartDay(meeting.windowEnd, meeting.spanDays)) {
    return { ok: false, message: "후보 기간 안에서 시작 날짜를 골라 주세요." };
  }
  const end = confirmedEnd(start, meeting.spanDays);

  // 공지에 넣을 "못 오는 사람": 확정 구간 기준으로 계산한다.
  const [memberRows, responseRows] = await Promise.all([
    db.select({ id: users.id, name: users.name, email: users.email }).from(spaceMembers).innerJoin(users, eq(users.id, spaceMembers.userId)).where(eq(spaceMembers.spaceId, meeting.spaceId)),
    db.select().from(meetingResponses).where(eq(meetingResponses.meetingId, meeting.id)),
  ]);
  const votes: Votes = {};
  for (const r of responseRows) (votes[r.day] ??= {})[r.userId] = r.answer;
  const [window] = rankWindows({ windowStart: start, windowEnd: end, spanDays: meeting.spanDays, memberIds: memberRows.map((m) => m.id), votes });
  const nameOf = new Map(memberRows.map((m) => [m.id, m.name?.trim() || m.email.split("@")[0]]));
  const names = (ids: string[]) => ids.map((id) => nameOf.get(id) ?? "").filter(Boolean).join(", ");

  const result = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(meetings)
      .set({
        status: "confirmed",
        confirmedStart: start,
        confirmedEnd: end,
        confirmedFrom: from,
        confirmedTo: to,
        confirmedAt: new Date(),
        version: sql`${meetings.version} + 1`,
        updatedAt: new Date(),
      })
      .where(and(eq(meetings.id, meeting.id), eq(meetings.status, "polling")))
      .returning({ id: meetings.id });
    if (!updated) return null;

    let noteId: string | null = null;
    if (createNote) {
      const template = defaultTemplateFor(access.space.kind);
      const meta = TEMPLATES[template];
      let sessionNo: number | null = null;
      if (meta.usesSessionNo) {
        const [last] = await tx
          .select({ n: notes.sessionNo })
          .from(notes)
          .where(and(eq(notes.spaceId, meeting.spaceId), eq(notes.template, "study"), isNull(notes.deletedAt)))
          .orderBy(desc(notes.sessionNo))
          .limit(1);
        sessionNo = (last?.n ?? 0) + 1;
      }
      const content = buildTemplateDoc(template, sessionNo ?? 1);
      const [note] = await tx
        .insert(notes)
        .values({
          spaceId: meeting.spaceId,
          title: `${meeting.title} · ${shortDay(start)}`,
          template,
          content,
          plainText: docToPlainText(content),
          sessionNo,
          createdBy: access.userId,
          updatedBy: access.userId,
        })
        .returning({ id: notes.id });
      await tx.insert(noteDocs).values({ noteId: note.id }).onConflictDoNothing();
      await tx.update(meetings).set({ noteId: note.id }).where(eq(meetings.id, meeting.id));
      noteId = note.id;
    }

    const when = `${dayRangeLabel(start, end)}${from && to ? ` ${from}–${to}` : ""}`;
    const lines = [`[일정 확정] ${meeting.title}`, when];
    if (meeting.location) lines.push(`장소 ${meeting.location}`);
    if (window?.no.length) lines.push(`참석이 어려운 사람: ${names(window.no)}`);
    if (window?.none.length) lines.push(`아직 답하지 않은 사람: ${names(window.none)}`);
    if (noteId) lines.push(`회의록: /s/${meeting.spaceId}/n/${noteId}`);
    await postChat(meeting.spaceId, access.userId, lines.join("\n"), tx);
    return { noteId };
  });
  if (!result) return { ok: false, message: "다른 사람이 먼저 확정했거나 취소했어요. 새로고침해 주세요." };
  revalidateMeeting(meeting.spaceId, meeting.id);
  return { ok: true, id: meeting.id, message: result.noteId ? "확정하고 회의록을 만들었어요." : "확정했어요." };
}

/** 확정 값을 비우고 상태를 바꾼다. 확정 컬럼은 상태와 함께만 존재할 수 있다(DB 제약). */
async function leaveConfirmed(meetingId: string, to: "polling" | "cancelled", label: string): Promise<MeetingResult> {
  const loaded = await loadForMember(meetingId);
  if (!loaded) return NOT_FOUND;
  const { meeting, access } = loaded;
  if (!canManage(meeting, access)) return FORBIDDEN;
  const from = to === "polling" ? ["confirmed"] : ["polling", "confirmed"];
  if (!from.includes(meeting.status)) return { ok: false, message: "지금은 할 수 없는 동작이에요." };
  const changed = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(meetings)
      .set({
        status: to,
        confirmedStart: null,
        confirmedEnd: null,
        confirmedFrom: null,
        confirmedTo: null,
        confirmedAt: null,
        version: sql`${meetings.version} + 1`,
        updatedAt: new Date(),
      })
      .where(and(eq(meetings.id, meeting.id), inArray(meetings.status, from as ("polling" | "confirmed")[])))
      .returning({ id: meetings.id });
    if (!row) return false;
    await postChat(meeting.spaceId, access.userId, `[${label}] ${meeting.title}`, tx);
    return true;
  });
  if (!changed) return { ok: false, message: "다른 곳에서 먼저 바뀌었어요. 새로고침해 주세요." };
  revalidateMeeting(meeting.spaceId, meeting.id);
  return { ok: true, id: meeting.id };
}

export async function cancelMeeting(meetingId: unknown): Promise<MeetingResult> {
  if (typeof meetingId !== "string") return NOT_FOUND;
  return leaveConfirmed(meetingId, "cancelled", "일정 취소");
}

export async function reopenMeeting(meetingId: unknown): Promise<MeetingResult> {
  if (typeof meetingId !== "string") return NOT_FOUND;
  return leaveConfirmed(meetingId, "polling", "일정 다시 조사");
}
