"use server";

import { and, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { pollExcludedDays, pollParticipants, polls, type Poll } from "@/lib/db/schema";
import { candidateDays, checkDeadlineChange, deadlineInput, isPollClosed, pollInput, pollPatchInput } from "@/lib/polls";
import { storedLinkToken } from "@/lib/token-store";
import { linkToken } from "@/lib/utils";

/**
 * 일정 투표 — 만든 사람(회원) 전용 동작. 참여자의 제출은 actions/poll-vote.ts 에 따로 있다.
 *
 * 권한 경계는 스페이스가 아니라 소유자다. 모든 동작이 owner_id = 세션 사용자를 건 채로 찾고,
 * 없는 투표와 남의 투표는 같은 응답이다(존재 여부를 알려 주지 않는다).
 * 동시에 두 곳에서 눌러도 어긋나지 않게 상태 전환은 조건을 건 UPDATE 한 번으로 한다.
 */

export type PollResult = { ok: true; id?: string; version?: number; message?: string } | { ok: false; message: string };

const NOT_FOUND: PollResult = { ok: false, message: "투표를 찾을 수 없어요." };
const STALE: PollResult = { ok: false, message: "다른 곳에서 먼저 바뀌었어요. 화면을 새로 고친 뒤 다시 시도해 주세요." };
/** 한 사람이 동시에 열어 둘 수 있는 투표 수. 링크가 무한히 쌓이는 것을 막는다. */
const MAX_OPEN_POLLS = 50;

async function loadOwned(pollId: string): Promise<Poll | null> {
  const user = await requireUser();
  if (!/^[0-9a-f-]{36}$/i.test(pollId)) return null;
  const [row] = await db.select().from(polls).where(and(eq(polls.id, pollId), eq(polls.ownerId, user.id))).limit(1);
  return row ?? null;
}

function revalidate(pollId?: string) {
  revalidatePath("/polls");
  if (pollId) revalidatePath(`/polls/${pollId}`);
}

export async function createPoll(input: unknown): Promise<PollResult> {
  const parsed = pollInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const data = parsed.data;
  const user = await requireUser();

  const respondBy = data.respondBy ? new Date(data.respondBy) : null;
  if (respondBy && respondBy.getTime() <= Date.now()) return { ok: false, message: "마감 시각이 이미 지났어요. 지금보다 뒤의 시각을 골라 주세요." };

  const [open] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(polls)
    .where(and(eq(polls.ownerId, user.id), eq(polls.status, "open")));
  if ((open?.n ?? 0) >= MAX_OPEN_POLLS) return { ok: false, message: `진행 중인 투표는 ${MAX_OPEN_POLLS}개까지예요. 끝난 투표를 먼저 마감해 주세요.` };

  const stored = storedLinkToken(linkToken());
  const id = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(polls)
      .values({
        ownerId: user.id,
        title: data.title,
        description: data.description,
        rangeStart: data.rangeStart,
        rangeEnd: data.rangeEnd,
        resultVisibility: data.resultVisibility,
        respondBy,
        token: stored.token,
        tokenHash: stored.tokenHash,
      })
      .returning({ id: polls.id });
    if (data.excluded.length > 0) {
      await tx.insert(pollExcludedDays).values(data.excluded.map((e) => ({ pollId: row.id, day: e.day, reason: e.reason })));
    }
    return row.id;
  });
  revalidate();
  return { ok: true, id };
}

export async function updatePoll(pollId: string, patch: unknown): Promise<PollResult> {
  const parsed = pollPatchInput.safeParse(patch);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const poll = await loadOwned(pollId);
  if (!poll) return NOT_FOUND;
  await db.update(polls).set({ ...parsed.data, updatedAt: new Date(), version: sql`${polls.version} + 1` }).where(eq(polls.id, poll.id));
  revalidate(poll.id);
  return { ok: true };
}

/**
 * 마감 변경·연장·해제 공용. 규칙은 checkDeadlineChange 한 곳에 있다.
 * version 이 다르면 거절한다 — 두 곳에서 동시에 연장해도 나중 것이 앞선 것을 조용히 덮지 않게.
 */
export async function setDeadline(input: unknown): Promise<PollResult> {
  const parsed = deadlineInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: "마감 시각을 확인해 주세요." };
  const poll = await loadOwned(parsed.data.pollId);
  if (!poll) return NOT_FOUND;
  if (poll.version !== parsed.data.version) return STALE;

  const next = parsed.data.respondBy ? new Date(parsed.data.respondBy) : null;
  const check = checkDeadlineChange(poll, next);
  if (!check.ok) return check;

  const [updated] = await db
    .update(polls)
    .set({ respondBy: next, status: check.status, updatedAt: new Date(), version: sql`${polls.version} + 1` })
    .where(and(eq(polls.id, poll.id), eq(polls.version, poll.version), ne(polls.status, "confirmed")))
    .returning({ version: polls.version });
  if (!updated) return STALE;
  revalidate(poll.id);
  return { ok: true, version: updated.version };
}

/** 지금 마감. 이미 닫혔으면 아무것도 바꾸지 않는다. */
export async function closePoll(pollId: string): Promise<PollResult> {
  const poll = await loadOwned(pollId);
  if (!poll) return NOT_FOUND;
  const [updated] = await db
    .update(polls)
    .set({ status: "closed", updatedAt: new Date(), version: sql`${polls.version} + 1` })
    .where(and(eq(polls.id, poll.id), eq(polls.status, "open")))
    .returning({ version: polls.version });
  revalidate(poll.id);
  return { ok: true, version: updated?.version ?? poll.version };
}

/**
 * 다시 열기. 마감 시각이 이미 지났다면 열어도 곧바로 닫혀 있게 되므로 거절하고 시각을 먼저 바꾸게 한다.
 * (시각을 조용히 지우면 만든 사람이 의도하지 않은 채 마감 없는 투표가 된다.)
 */
export async function reopenPoll(pollId: string): Promise<PollResult> {
  const poll = await loadOwned(pollId);
  if (!poll) return NOT_FOUND;
  if (poll.status === "confirmed") return { ok: false, message: "날짜가 확정된 투표예요. 먼저 확정을 취소해 주세요." };
  if (poll.respondBy && poll.respondBy.getTime() <= Date.now()) {
    return { ok: false, message: "마감 시각이 이미 지났어요. 마감 시각을 늘리거나 없애 주세요." };
  }
  const [updated] = await db
    .update(polls)
    .set({ status: "open", updatedAt: new Date(), version: sql`${polls.version} + 1` })
    .where(and(eq(polls.id, poll.id), eq(polls.status, "closed")))
    .returning({ version: polls.version });
  revalidate(poll.id);
  return { ok: true, version: updated?.version ?? poll.version };
}

/** 확정. 후보일만 고를 수 있다. 이미 확정된 투표에서 다른 날을 고르면 날짜만 바뀐다. */
export async function confirmPollDay(pollId: string, day: string): Promise<PollResult> {
  const poll = await loadOwned(pollId);
  if (!poll) return NOT_FOUND;
  const excluded = await db.select({ day: pollExcludedDays.day }).from(pollExcludedDays).where(eq(pollExcludedDays.pollId, poll.id));
  if (!candidateDays(poll.rangeStart, poll.rangeEnd, excluded.map((e) => e.day)).includes(day)) {
    return { ok: false, message: "후보일이 아닌 날짜예요." };
  }
  const [updated] = await db
    .update(polls)
    .set({ status: "confirmed", confirmedDay: day, updatedAt: new Date(), version: sql`${polls.version} + 1` })
    .where(eq(polls.id, poll.id))
    .returning({ version: polls.version });
  revalidate(poll.id);
  return { ok: true, version: updated.version };
}

/** 확정 취소. 마감 시각이 지났다면 닫힌 채로, 아니면 다시 연다. */
export async function unconfirmPoll(pollId: string): Promise<PollResult> {
  const poll = await loadOwned(pollId);
  if (!poll) return NOT_FOUND;
  const status = isPollClosed({ status: "open", respondBy: poll.respondBy }) ? "closed" : "open";
  const [updated] = await db
    .update(polls)
    .set({ status, confirmedDay: null, updatedAt: new Date(), version: sql`${polls.version} + 1` })
    .where(and(eq(polls.id, poll.id), eq(polls.status, "confirmed")))
    .returning({ version: polls.version });
  revalidate(poll.id);
  return { ok: true, version: updated?.version ?? poll.version };
}

/** 스팸·장난 응답을 지운다. 이름도 함께 비워지므로 그 이름으로 다시 제출할 수 있다. */
export async function removeParticipant(pollId: string, participantId: string): Promise<PollResult> {
  const poll = await loadOwned(pollId);
  if (!poll) return NOT_FOUND;
  if (!/^[0-9a-f-]{36}$/i.test(participantId)) return NOT_FOUND;
  await db.delete(pollParticipants).where(and(eq(pollParticipants.id, participantId), eq(pollParticipants.pollId, poll.id)));
  revalidate(poll.id);
  return { ok: true };
}

/** 링크 폐기. 이전 링크는 바로 열리지 않는다. 응답은 그대로 남는다. */
export async function revokePollLink(pollId: string): Promise<PollResult> {
  const poll = await loadOwned(pollId);
  if (!poll) return NOT_FOUND;
  await db.update(polls).set({ revokedAt: new Date(), updatedAt: new Date() }).where(eq(polls.id, poll.id));
  revalidate(poll.id);
  return { ok: true };
}

/** 새 링크 발급. 이전 링크는 즉시 무효가 되고, 폐기돼 있던 투표도 다시 열린다. */
export async function rotatePollLink(pollId: string): Promise<PollResult> {
  const poll = await loadOwned(pollId);
  if (!poll) return NOT_FOUND;
  const stored = storedLinkToken(linkToken());
  await db.update(polls).set({ token: stored.token, tokenHash: stored.tokenHash, revokedAt: null, updatedAt: new Date() }).where(eq(polls.id, poll.id));
  revalidate(poll.id);
  return { ok: true };
}

export async function deletePoll(pollId: string): Promise<PollResult> {
  const poll = await loadOwned(pollId);
  if (!poll) return NOT_FOUND;
  await db.delete(polls).where(eq(polls.id, poll.id));
  revalidate();
  return { ok: true };
}
