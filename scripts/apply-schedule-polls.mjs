/**
 * 마이그레이션 0013(일정 투표)을 운영 DB에 적용한다.
 *
 *   node scripts/apply-schedule-polls.mjs --check   # 아무것도 바꾸지 않고 상태만 본다
 *   node scripts/apply-schedule-polls.mjs           # 적용
 *
 * `drizzle-kit migrate` 대신 쓰는 이유는 apply-calendar-meetings.mjs 머리말과 같다
 * (저장소 journal 과 DB 의 기록이 어긋나 있어 migrate 가 이미 적용된 것을 다시 실행한다).
 * 직전 마이그레이션이 정확히 0012 일 때만 적용하고, 한 트랜잭션이라 중간에 멈춰도 반쯤 적용되지 않는다.
 *
 * 순서: 이 스크립트를 먼저 → 그다음 앱 배포. 배포가 먼저면 새 화면이 없는 테이블을 읽다 실패한다.
 */
import "./load-env.mjs";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import postgres from "postgres";

const TAG = "0013_schedule_polls";
const TABLES = ["polls", "poll_excluded_days", "poll_participants", "poll_unavailable_days"];
const CHECK_ONLY = process.argv.includes("--check");
/** 해시는 줄바꿈을 LF 로 맞춘 뒤 계산한다(Windows 작업 폴더의 CRLF 가 기준선을 어긋나게 하지 않게). */
const digest = (body) => createHash("sha256").update(body.replace(/\r\n/g, "\n")).digest("hex");
// 내부 DB(루프백)는 TLS 없이, 외부 호스트는 TLS 를 요구한다. 앱의 pool-options 와 같은 기준이다.
const url = new URL(process.env.DATABASE_URL);
const loopback = ["127.0.0.1", "localhost", "::1"].includes(url.hostname);
const sql = postgres(process.env.DATABASE_URL, { ssl: loopback ? false : "require", max: 1, prepare: false });

try {
  const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8"));
  const position = journal.entries.findIndex((entry) => entry.tag === TAG);
  if (position < 1) throw new Error(`journal 에 ${TAG} 가 없거나 첫 항목이다`);
  const entry = journal.entries[position];
  const prior = journal.entries[position - 1];
  const body = await readFile(`drizzle/${TAG}.sql`, "utf8");
  const priorHash = digest(await readFile(`drizzle/${prior.tag}.sql`, "utf8"));

  const report = async (tx) => {
    const [last] = await tx`select hash, created_at from drizzle.__drizzle_migrations order by created_at desc limit 1`;
    const [tables] = await tx`select count(*) filter (where to_regclass(t) is not null)::int as present from unnest(${TABLES.map((t) => `public.${t}`)}::text[]) as t`;
    return { last, present: tables.present, baselineOk: last?.hash === priorHash, alreadyApplied: last?.hash === digest(body) };
  };

  if (CHECK_ONLY) {
    const info = await report(sql);
    console.log(JSON.stringify({
      직전_기록: info.last ? `${info.last.hash.slice(0, 12)}…` : "없음",
      기대하는_직전: `${prior.tag} (${priorHash.slice(0, 12)}…)`,
      기준선_일치: info.baselineOk,
      이미_적용됨: info.alreadyApplied,
      새_테이블_개수: info.present,
      판정: info.alreadyApplied ? "이미 적용됨" : info.baselineOk ? "적용 가능" : "적용 불가: 기준선이 다르다(아무것도 바꾸지 않음)",
    }, null, 2));
  } else {
    console.log(JSON.stringify(await sql.begin(async (tx) => {
      // 같은 스크립트가 동시에 두 번 돌지 않게 잠근다.
      await tx`select pg_advisory_xact_lock(1793000013)`;
      // 새 테이블에는 정책이 없다. RLS 를 우회하는 계정(Supabase 의 service 계정 등)이거나,
      // 내부 DB 처럼 테이블 소유자이면서 FORCE 가 꺼져 있어 RLS 를 받지 않는 계정이어야 앱이 읽고 쓸 수 있다.
      const [role] = await tx`select rolbypassrls or rolsuper as bypass from pg_roles where rolname = current_user`;
      const [owned] = await tx`select pg_get_userbyid(relowner) = current_user as owner, relforcerowsecurity as forced from pg_class where oid = 'public.users'::regclass`;
      if (!role?.bypass && !(owned?.owner && !owned.forced)) {
        throw new Error("앱 계정이 RLS 를 우회하지도, 테이블 소유자(FORCE 꺼짐)이지도 않다. 새 테이블에 정책이 없어 앱이 읽지 못한다");
      }
      const info = await report(tx);
      if (info.alreadyApplied) return { status: "already-applied" };
      if (!info.baselineOk) throw new Error(`직전 마이그레이션이 ${prior.tag} 이 아니다. 아무것도 바꾸지 않았다`);
      if (info.present > 0) throw new Error("일정 투표 테이블이 이미 일부 있다. 수동 확인이 필요하다");

      for (const statement of body.split("--> statement-breakpoint")) if (statement.trim()) await tx.unsafe(statement);
      await tx`insert into drizzle.__drizzle_migrations (hash, created_at) values (${digest(body)}, ${entry.when})`;

      // 적용 결과 검증: 실패하면 여기서 던져 전체를 되돌린다.
      const rls = await tx`select relname, relrowsecurity from pg_class where oid = any(${TABLES.map((t) => `public.${t}`)}::regclass[])`;
      if (rls.length !== TABLES.length || rls.some((row) => !row.relrowsecurity)) throw new Error("새 테이블의 RLS 가 꺼져 있다");
      const [mine] = await tx`select count(*)::int as n from pg_class where oid = any(${TABLES.map((t) => `public.${t}`)}::regclass[]) and pg_get_userbyid(relowner) = current_user and not relforcerowsecurity`;
      if (!role?.bypass && mine.n !== TABLES.length) throw new Error("새 테이블의 소유자가 앱 계정이 아니거나 FORCE RLS 가 켜져 있다");
      const [checks] = await tx`select count(*)::int as n from pg_constraint where conname in ('polls_text_check','polls_range_check','polls_status_check','polls_confirmed_check','polls_limits_check','poll_participants_name_check')`;
      if (checks.n !== 6) throw new Error("체크 제약이 빠졌다");
      const [unique] = await tx`select count(*)::int as n from pg_indexes where indexname in ('polls_token_hash_idx','poll_participants_name_idx','poll_participants_user_idx')`;
      if (unique.n !== 3) throw new Error("고유 인덱스가 빠졌다");
      return { status: "applied", migration: TAG, tables: TABLES.length, rls: true };
    }), null, 2));
  }
} finally {
  await sql.end({ timeout: 5 });
}
