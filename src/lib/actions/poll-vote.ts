"use server";

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { pollExcludedDays, pollParticipants, pollUnavailableDays } from "@/lib/db/schema";
import { allowPollVote } from "@/lib/poll-rate";
import { hashEditToken, pollCookieName } from "@/lib/poll-identity";
import { findMyParticipant, loadPollByToken } from "@/lib/poll-public";
import { candidateDays, cleanName, isPollClosed, nameKey, validName, voteInput } from "@/lib/polls";

/**
 * 일정 투표 — 링크로 들어온 사람의 제출. 로그인하지 않아도 부를 수 있는 동작이라
 * 입력은 하나도 믿지 않는다: 토큰·이름·날짜를 전부 서버에서 다시 검증하고, 주소별로 횟수를 센다.
 *
 * 본인 확인:
 *   로그인한 회원 → user_id 로 응답 하나(기기를 바꿔도 이어진다)
 *   비회원        → 첫 제출에 쿠키를 심고 해시만 저장. 같은 브라우저에서만 고칠 수 있다.
 * 다른 사람의 응답은 이름을 알아도 고칠 수 없다 — 이름이 겹치면 거절할 뿐이다.
 */

export type VoteResult = { ok: true; name: string } | { ok: false; message: string };

const UNAVAILABLE: VoteResult = { ok: false, message: "열 수 없는 링크예요." };
const COOKIE_MAX_AGE = 90 * 24 * 60 * 60;

/** postgres 고유 제약 위반(23505). drizzle 이 감싸면 cause 에 들어 있다. */
function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string; cause?: { code?: string } } | null);
  return code?.code === "23505" || code?.cause?.code === "23505";
}

export async function submitVote(input: unknown): Promise<VoteResult> {
  const parsed = voteInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: "입력을 확인해 주세요." };
  const { token, days } = parsed.data;

  const poll = await loadPollByToken(token);
  if (!poll) return UNAVAILABLE;
  if (!(await allowPollVote(poll.tokenHash))) return { ok: false, message: "요청이 너무 많아요. 잠시 뒤에 다시 시도해 주세요." };
  if (isPollClosed(poll)) return { ok: false, message: "투표가 마감됐어요." };

  const session = await auth();
  const userId = session?.user?.id ?? null;
  const rawName = parsed.data.name.trim() || (userId ? session?.user?.name ?? "" : "");
  const nameError = validName(rawName);
  if (nameError) return { ok: false, message: nameError };
  const name = cleanName(rawName);

  // 날짜는 조용히 걸러 내지 않고 거절한다 — 걸러 내면 본인은 체크했다고 믿는 날이 저장되지 않는다.
  const excluded = await db.select({ day: pollExcludedDays.day }).from(pollExcludedDays).where(eq(pollExcludedDays.pollId, poll.id));
  const allowed = new Set(candidateDays(poll.rangeStart, poll.rangeEnd, excluded.map((e) => e.day)));
  const unique = [...new Set(days)];
  if (unique.some((day) => !allowed.has(day))) return { ok: false, message: "선택할 수 없는 날짜가 있어요. 화면을 새로 고쳐 주세요." };

  const jar = await cookies();
  const mine = await findMyParticipant(poll);
  const newEditToken = mine || userId ? null : randomBytes(24).toString("base64url");

  try {
    await db.transaction(async (tx) => {
      let participantId: string;
      if (mine) {
        participantId = mine.participant.id;
        await tx
          .update(pollParticipants)
          .set({
            displayName: name,
            nameKey: nameKey(name),
            // 계정으로 들어온 사람이 기기 쿠키로 낸 응답을 이어받는다. 이미 다른 응답이 있으면 위 고유 제약이 막는다.
            userId: mine.participant.userId ?? userId,
            updatedAt: new Date(),
          })
          .where(eq(pollParticipants.id, participantId));
      } else {
        const [count] = await tx.select({ n: sql<number>`count(*)::int` }).from(pollParticipants).where(eq(pollParticipants.pollId, poll.id));
        if ((count?.n ?? 0) >= poll.maxParticipants) throw new FullError();
        const [created] = await tx
          .insert(pollParticipants)
          .values({
            pollId: poll.id,
            userId,
            displayName: name,
            nameKey: nameKey(name),
            editTokenHash: newEditToken ? hashEditToken(newEditToken) : null,
          })
          .returning({ id: pollParticipants.id });
        participantId = created.id;
      }
      // 응답은 통째로 교체한다. 한 트랜잭션이라 중간 상태가 보이지 않는다.
      await tx.delete(pollUnavailableDays).where(eq(pollUnavailableDays.participantId, participantId));
      if (unique.length > 0) await tx.insert(pollUnavailableDays).values(unique.map((day) => ({ participantId, day })));
    });
  } catch (error) {
    if (error instanceof FullError) return { ok: false, message: "참여 인원이 가득 찼어요. 만든 분께 문의해 주세요." };
    if (isUniqueViolation(error)) return { ok: false, message: "이미 쓰는 이름이에요. 다른 이름을 적어 주세요." };
    throw error;
  }

  if (newEditToken) {
    jar.set(pollCookieName(poll.id), newEditToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/v",
      maxAge: COOKIE_MAX_AGE,
    });
  }
  revalidatePath(`/polls/${poll.id}`);
  return { ok: true, name };
}

class FullError extends Error {}
