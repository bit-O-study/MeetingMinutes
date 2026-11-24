import "server-only";

import { cookies } from "next/headers";
import { and, asc, eq, isNull } from "drizzle-orm";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { pollExcludedDays, pollParticipants, pollUnavailableDays, polls, type Poll, type PollParticipant, type PollStatus } from "@/lib/db/schema";
import { candidateDays, isPollClosed, tallyPoll } from "@/lib/polls";
import { hashEditToken, pollCookieName } from "@/lib/poll-identity";
import { hashLinkToken } from "@/lib/token-store";

/**
 * 링크로 들어온 사람(로그인 여부와 무관)이 보는 투표.
 *
 * 노출 범위는 의도적으로 좁다: 제목·설명·기간·제외일·마감·확정 날짜, 그리고 (공개 설정이면) 제출한 뒤의 집계 숫자.
 * 만든 사람의 계정, 다른 투표, 참여자 이름 목록은 어떤 경우에도 내보내지 않는다.
 * 없는 토큰·폐기·삭제는 모두 null 이다 — 화면은 같은 "열 수 없는 링크"로 처리한다.
 */

export async function loadPollByToken(token: string): Promise<Poll | null> {
  if (token.length < 8 || token.length > 64) return null;
  const [poll] = await db
    .select()
    .from(polls)
    .where(and(eq(polls.tokenHash, hashLinkToken(token)), isNull(polls.revokedAt)))
    .limit(1);
  return poll ?? null;
}

/** 이 기기(쿠키) 또는 로그인한 계정으로 이미 낸 응답. */
export async function findMyParticipant(poll: Poll): Promise<{ participant: PollParticipant; viaAccount: boolean } | null> {
  const session = await auth();
  const userId = session?.user?.id;
  if (userId) {
    const [row] = await db
      .select()
      .from(pollParticipants)
      .where(and(eq(pollParticipants.pollId, poll.id), eq(pollParticipants.userId, userId)))
      .limit(1);
    if (row) return { participant: row, viaAccount: true };
  }
  const value = (await cookies()).get(pollCookieName(poll.id))?.value;
  if (value) {
    const [row] = await db
      .select()
      .from(pollParticipants)
      .where(and(eq(pollParticipants.pollId, poll.id), eq(pollParticipants.editTokenHash, hashEditToken(value))))
      .limit(1);
    if (row) return { participant: row, viaAccount: false };
  }
  return null;
}

export type PublicPollView = {
  title: string;
  description: string;
  rangeStart: string;
  rangeEnd: string;
  excluded: string[];
  /** 마감 시각까지 반영한 지금 상태. open 이면 응답을 받는다. */
  state: PollStatus;
  respondBy: string | null;
  confirmedDay: string | null;
  /** 로그인한 회원이면 이름을 미리 채워 준다. */
  viewer: { isMember: boolean; name: string };
  /** 이 기기·계정으로 이미 낸 응답 */
  me: { name: string; unavailable: string[] } | null;
  /** 공개 설정이고 내가 제출한 뒤에만 채워진다. 숫자만 — 이름은 없다. */
  results: { total: number; top: { day: string; available: number }[] } | null;
};

export async function getPublicPoll(token: string): Promise<PublicPollView | null> {
  const poll = await loadPollByToken(token);
  if (!poll) return null;

  const [excluded, mine, session] = await Promise.all([
    db.select().from(pollExcludedDays).where(eq(pollExcludedDays.pollId, poll.id)).orderBy(asc(pollExcludedDays.day)),
    findMyParticipant(poll),
    auth(),
  ]);

  const unavailable = mine
    ? (await db
        .select({ day: pollUnavailableDays.day })
        .from(pollUnavailableDays)
        .where(eq(pollUnavailableDays.participantId, mine.participant.id))
        .orderBy(asc(pollUnavailableDays.day))).map((r) => r.day)
    : [];

  let results: PublicPollView["results"] = null;
  if (mine && poll.resultVisibility === "participants") {
    const candidates = candidateDays(poll.rangeStart, poll.rangeEnd, excluded.map((e) => e.day));
    const people = await db.select({ id: pollParticipants.id }).from(pollParticipants).where(eq(pollParticipants.pollId, poll.id));
    const rows = people.length
      ? await db
          .select({ participantId: pollUnavailableDays.participantId, day: pollUnavailableDays.day })
          .from(pollUnavailableDays)
          .innerJoin(pollParticipants, eq(pollParticipants.id, pollUnavailableDays.participantId))
          .where(eq(pollParticipants.pollId, poll.id))
      : [];
    const byPerson = new Map<string, string[]>();
    for (const row of rows) byPerson.set(row.participantId, [...(byPerson.get(row.participantId) ?? []), row.day]);
    const tally = tallyPoll(candidates, people.map((p) => ({ id: p.id, unavailable: byPerson.get(p.id) ?? [] })));
    results = { total: tally.total, top: tally.ranked.slice(0, 3).map((day) => ({ day, available: tally.available[day] })) };
  }

  const closed = isPollClosed(poll);
  return {
    title: poll.title,
    description: poll.description,
    rangeStart: poll.rangeStart,
    rangeEnd: poll.rangeEnd,
    excluded: excluded.map((e) => e.day),
    state: poll.status === "confirmed" ? "confirmed" : closed ? "closed" : "open",
    respondBy: poll.respondBy?.toISOString() ?? null,
    confirmedDay: poll.confirmedDay,
    viewer: { isMember: Boolean(session?.user?.id), name: session?.user?.name ?? "" },
    me: mine ? { name: mine.participant.displayName, unavailable } : null,
    results,
  };
}
