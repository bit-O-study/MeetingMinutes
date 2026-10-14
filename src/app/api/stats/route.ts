import { timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

/**
 * 통합 어드민(heltch-admin)이 읽는 사용 통계 — 날짜별 사람 수만 돌려준다.
 *
 * 이메일·이름·노트 내용 같은 개인 정보는 내보내지 않는다(숫자만).
 * 어드민에 메모 DB 접속 정보를 주지 않으려고 DB 직접 조회 대신 이 API 를 둔다.
 * 인증: Authorization: Bearer <STATS_API_TOKEN>. 토큰이 설정돼 있지 않으면 늘 거절한다.
 *
 * - visitors: 그날 앱 화면을 연 사람(daily_visits, 2026-10-14 부터 기록)
 * - active:   그날 무언가 남긴 사람(메시지·이슈·노트 이력) ∪ 접속자 — 기록 시작 전 날짜도 보인다
 * - signups:  그날 가입한 사람
 */
export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const expected = process.env.STATS_API_TOKEN;
  const got = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expected || expected.length < 24) return false;
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

type DayRow = { day: string; visitors: number; active: number; signups: number; messages: number; edits: number };

export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });

  const asked = Number(new URL(request.url).searchParams.get("days") ?? 30);
  const days = Number.isFinite(asked) ? Math.min(Math.max(Math.trunc(asked), 1), 90) : 30;

  const [rows, [totals]] = await Promise.all([
    db.execute<DayRow>(sql`
      with span as (
        select generate_series(
          (now() at time zone 'Asia/Seoul')::date - (${days}::int - 1),
          (now() at time zone 'Asia/Seoul')::date,
          interval '1 day'
        )::date as day
      ),
      acts as (
        select (created_at at time zone 'Asia/Seoul')::date as day, created_by as user_id from project_messages where created_by is not null
        union select (created_at at time zone 'Asia/Seoul')::date, created_by from issues where created_by is not null
        union select (created_at at time zone 'Asia/Seoul')::date, actor_id from note_revisions where actor_id is not null
        union select day, user_id from daily_visits
      )
      select
        to_char(span.day, 'YYYY-MM-DD') as day,
        (select count(*) from daily_visits v where v.day = span.day)::int as visitors,
        (select count(distinct a.user_id) from acts a where a.day = span.day)::int as active,
        (select count(*) from users u where (u.created_at at time zone 'Asia/Seoul')::date = span.day)::int as signups,
        (select count(*) from project_messages m where (m.created_at at time zone 'Asia/Seoul')::date = span.day)::int as messages,
        (select count(*) from note_revisions r where (r.created_at at time zone 'Asia/Seoul')::date = span.day)::int as edits
      from span
      order by span.day
    `),
    db.execute<{ users: number; spaces: number; notes: number }>(sql`
      select
        (select count(*) from users)::int as users,
        (select count(*) from spaces where deleted_at is null)::int as spaces,
        (select count(*) from notes where deleted_at is null)::int as notes
    `),
  ]);

  return Response.json(
    { days: [...rows], totals, trackedSince: "2026-10-14" },
    { headers: { "cache-control": "no-store" } },
  );
}
