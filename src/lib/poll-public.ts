import "server-only";

import { cookies } from "next/headers";
import { and, asc, eq, isNull } from "drizzle-orm";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { pollExcludedDays, pollParticipants, pollUnavailableDays, polls, type Poll, type PollParticipant, type PollStatus } from "@/lib/db/schema";
import { isPollClosed } from "@/lib/polls";
import { hashEditToken, pollCookieName } from "@/lib/poll-identity";
import { hashLinkToken } from "@/lib/token-store";

/**
 * 링크로 들어온 사람(로그인 여부와 무관)이 보는 투표.
 *
 * 노출 범위는 의도적으로 좁다: 제목·모임 정보(음식·식당·위치)·기간·제외일·마감·확정 날짜, 그리고 본인 응답뿐이다.
 * 만든 사람의 계정, 다른 투표, 다른 참여자의 이름과 응답은 어떤 경우에도 내보내지 않는다.
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
  foodType: string;
  restaurant: string;
  location: string;
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

  const closed = isPollClosed(poll);
  return {
    title: poll.title,
    foodType: poll.foodType,
    restaurant: poll.restaurant,
    location: poll.location,
    rangeStart: poll.rangeStart,
    rangeEnd: poll.rangeEnd,
    excluded: excluded.map((e) => e.day),
    state: poll.status === "confirmed" ? "confirmed" : closed ? "closed" : "open",
    respondBy: poll.respondBy?.toISOString() ?? null,
    confirmedDay: poll.confirmedDay,
    viewer: { isMember: Boolean(session?.user?.id), name: session?.user?.name ?? "" },
    me: mine ? { name: mine.participant.displayName, unavailable } : null,
  };
}
