import "server-only";

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { pollExcludedDays, pollParticipants, pollUnavailableDays, polls, type Poll, type PollStatus, type PollVisibility } from "@/lib/db/schema";
import { candidateDays, isPollClosed, tallyPoll, type Tally } from "@/lib/polls";
import { openLinkToken } from "@/lib/token-store";
import { absoluteUrl } from "@/lib/utils";

/**
 * 만든 사람(회원) 쪽 읽기. 모든 조회가 owner_id = 나 를 건다.
 * 남의 투표와 없는 투표는 같은 null 이다 — 화면은 둘 다 not-found 로 보낸다.
 */

export type PollListItem = {
  id: string;
  title: string;
  rangeStart: string;
  rangeEnd: string;
  status: PollStatus;
  /** 마감 시각이 지났는지까지 반영한 "지금 받고 있나" */
  closed: boolean;
  confirmedDay: string | null;
  respondBy: string | null;
  participants: number;
};

export async function listMyPolls(): Promise<PollListItem[]> {
  const user = await requireUser();
  const rows = await db
    .select({
      poll: polls,
      participants: sql<number>`(select count(*)::int from ${pollParticipants} where ${pollParticipants.pollId} = ${polls.id})`,
    })
    .from(polls)
    .where(eq(polls.ownerId, user.id))
    .orderBy(desc(polls.createdAt))
    .limit(200);
  const now = new Date();
  return rows.map(({ poll, participants }) => ({
    id: poll.id,
    title: poll.title,
    rangeStart: poll.rangeStart,
    rangeEnd: poll.rangeEnd,
    status: poll.status,
    closed: isPollClosed(poll, now),
    confirmedDay: poll.confirmedDay,
    respondBy: poll.respondBy?.toISOString() ?? null,
    participants,
  }));
}

export type OwnerPollView = {
  id: string;
  title: string;
  description: string;
  rangeStart: string;
  rangeEnd: string;
  status: PollStatus;
  closed: boolean;
  confirmedDay: string | null;
  resultVisibility: PollVisibility;
  respondBy: string | null;
  version: number;
  /** 폐기됐거나 키가 바뀌어 풀 수 없으면 null */
  url: string | null;
  revoked: boolean;
  excluded: string[];
  participants: { id: string; name: string; isMember: boolean; submittedAt: string; unavailable: string[] }[];
  candidates: string[];
  tally: Tally;
};

export async function loadOwnerPoll(pollId: string): Promise<OwnerPollView | null> {
  const user = await requireUser();
  if (!/^[0-9a-f-]{36}$/i.test(pollId)) return null;
  const [poll] = await db.select().from(polls).where(and(eq(polls.id, pollId), eq(polls.ownerId, user.id))).limit(1);
  if (!poll) return null;
  return buildOwnerView(poll);
}

async function buildOwnerView(poll: Poll): Promise<OwnerPollView> {
  const [excluded, people] = await Promise.all([
    db.select().from(pollExcludedDays).where(eq(pollExcludedDays.pollId, poll.id)).orderBy(asc(pollExcludedDays.day)),
    db.select().from(pollParticipants).where(eq(pollParticipants.pollId, poll.id)).orderBy(asc(pollParticipants.submittedAt)),
  ]);
  const unavailable = people.length
    ? await db
        .select({ participantId: pollUnavailableDays.participantId, day: pollUnavailableDays.day })
        .from(pollUnavailableDays)
        .where(inArray(pollUnavailableDays.participantId, people.map((p) => p.id)))
    : [];
  const byPerson = new Map<string, string[]>();
  for (const row of unavailable) byPerson.set(row.participantId, [...(byPerson.get(row.participantId) ?? []), row.day]);

  const candidates = candidateDays(poll.rangeStart, poll.rangeEnd, excluded.map((e) => e.day));
  const participants = people.map((p) => ({
    id: p.id,
    name: p.displayName,
    isMember: p.userId !== null,
    submittedAt: p.submittedAt.toISOString(),
    unavailable: (byPerson.get(p.id) ?? []).sort(),
  }));
  const token = poll.revokedAt ? null : openLinkToken(poll.token);
  return {
    id: poll.id,
    title: poll.title,
    description: poll.description,
    rangeStart: poll.rangeStart,
    rangeEnd: poll.rangeEnd,
    status: poll.status,
    closed: isPollClosed(poll),
    confirmedDay: poll.confirmedDay,
    resultVisibility: poll.resultVisibility,
    respondBy: poll.respondBy?.toISOString() ?? null,
    version: poll.version,
    url: token ? absoluteUrl(`/v/${token}`) : null,
    revoked: poll.revokedAt !== null,
    excluded: excluded.map((e) => e.day),
    participants,
    candidates,
    tally: tallyPoll(candidates, participants.map((p) => ({ id: p.id, unavailable: p.unavailable }))),
  };
}
