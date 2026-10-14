import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { dailyVisits } from "@/lib/db/schema";

/**
 * 오늘(서울) 접속을 남긴다 — 통합 어드민의 "하루 몇 명 들어왔나".
 *
 * 같은 날 두 번째부터는 last_seen_at 만 바꾸고, 그것도 10분에 한 번만 쓴다.
 * 화면을 열 때마다 쓰기가 생기면 풀러 연결(상한 15)을 쓸데없이 잡는다.
 * 실패해도 화면은 열려야 하므로 오류는 삼킨다(기록은 부가 기능이다).
 */
export async function recordVisit(userId: string) {
  try {
    await db
      .insert(dailyVisits)
      .values({ day: sql`(now() at time zone 'Asia/Seoul')::date`, userId })
      .onConflictDoUpdate({
        target: [dailyVisits.day, dailyVisits.userId],
        set: { lastSeenAt: sql`now()` },
        setWhere: sql`${dailyVisits.lastSeenAt} < now() - interval '10 minutes'`,
      });
  } catch (error) {
    console.warn("[visits] 접속 기록 실패", error);
  }
}
