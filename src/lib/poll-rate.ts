import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { lt, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { authAttempts } from "@/lib/db/schema";

/**
 * 공개 투표 제출 속도 제한. 로그인 시도 제한과 같은 테이블(auth_attempts)을 쓴다 —
 * 인스턴스가 달라도 같은 횟수를 봐야 하고, 새 테이블을 만들 만큼 무거운 기능이 아니다.
 *
 * 링크를 아는 사람은 누구나 제출할 수 있으니 이름을 바꿔 가며 응답을 쏟아붓는 것이 가장 쉬운 남용이다.
 * 투표(링크)마다 주소별로 센다. 주소는 password-auth 와 같은 규칙으로, 프록시가 덮어쓰는 값만 믿는다.
 */
export const POLL_RATE_WINDOW_MS = 60_000;
/** 주소를 알 수 있을 때 한 주소가 한 투표에 1분에 보낼 수 있는 횟수 */
export const POLL_RATE_LIMIT = 10;
/** 주소를 알 수 없는 배포(모두 "local")에서는 한 버킷을 다 같이 쓰므로 넉넉히 둔다 */
export const POLL_RATE_LIMIT_SHARED = 120;

export function pollRateKey(tokenHash: string, address: string): string {
  return createHash("sha256").update(`poll-vote:${tokenHash}\n${address}`).digest("hex");
}

export async function clientAddress(): Promise<string> {
  const requestHeaders = await headers();
  return process.env.VERCEL ? requestHeaders.get("x-vercel-forwarded-for") ?? "unknown" : "local";
}

/** 한도 안이면 true. 호출할 때마다 한 번 센다. */
export async function allowPollVote(tokenHash: string): Promise<boolean> {
  const address = await clientAddress();
  const limit = address === "local" || address === "unknown" ? POLL_RATE_LIMIT_SHARED : POLL_RATE_LIMIT;
  await db.delete(authAttempts).where(lt(authAttempts.expiresAt, new Date()));
  const [row] = await db
    .insert(authAttempts)
    .values({ key: pollRateKey(tokenHash, address), count: 1, expiresAt: new Date(Date.now() + POLL_RATE_WINDOW_MS) })
    .onConflictDoUpdate({ target: authAttempts.key, set: { count: sql`${authAttempts.count} + 1` } })
    .returning({ count: authAttempts.count });
  return row.count <= limit;
}
