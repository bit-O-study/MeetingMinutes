/**
 * 마이그레이션 0011(캘린더·모임)을 운영 DB에 적용한다.
 *
 *   node scripts/apply-calendar-meetings.mjs --check   # 아무것도 바꾸지 않고 상태만 본다
 *   node scripts/apply-calendar-meetings.mjs           # 적용
 *
 * `drizzle-kit migrate` 대신 쓰는 이유: 이전 마이그레이션(0008·0009·0010)이 별도 스크립트로 적용돼
 * 저장소의 journal 과 DB 의 기록이 어긋나 있다. 그 상태에서 migrate 를 돌리면 이미 적용된 것을 다시 실행한다.
 * 이 스크립트는 직전 마이그레이션이 정확히 0010 일 때만 적용하고, 한 트랜잭션이라 중간에 멈춰도 반쯤 적용되지 않는다.
 *
 * 순서: 이 스크립트를 먼저 → 그다음 앱 배포. 배포가 먼저면 새 화면이 없는 테이블을 읽다 실패한다.
 */
import "./load-env.mjs";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import postgres from "postgres";

const TAG = "0011_calendar_meetings";
const CHECK_ONLY = process.argv.includes("--check");
const digest = (body) => createHash("sha256").update(body).digest("hex");
const sql = postgres(process.env.DATABASE_URL, { ssl: "require", max: 1, prepare: false });

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
    const [tables] = await tx`select count(*) filter (where to_regclass(t) is not null)::int as present from unnest(array['public.meetings','public.meeting_responses']) as t`;
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
      await tx`select pg_advisory_xact_lock(1793000011)`;
      const [role] = await tx`select rolbypassrls or rolsuper as bypass from pg_roles where rolname = current_user`;
      if (!role?.bypass) throw new Error("앱 계정이 RLS 를 우회할 수 있어야 한다(새 테이블에 정책이 없다)");
      const info = await report(tx);
      if (info.alreadyApplied) return { status: "already-applied" };
      if (!info.baselineOk) throw new Error("직전 마이그레이션이 0010 이 아니다. 아무것도 바꾸지 않았다");
      if (info.present > 0) throw new Error("모임 테이블이 이미 일부 있다. 수동 확인이 필요하다");

      for (const statement of body.split("--> statement-breakpoint")) if (statement.trim()) await tx.unsafe(statement);
      await tx`insert into drizzle.__drizzle_migrations (hash, created_at) values (${digest(body)}, ${entry.when})`;

      // 적용 결과 검증: 실패하면 여기서 던져 전체를 되돌린다.
      const rls = await tx`select relname, relrowsecurity from pg_class where oid in ('public.meetings'::regclass, 'public.meeting_responses'::regclass)`;
      if (rls.length !== 2 || rls.some((row) => !row.relrowsecurity)) throw new Error("새 테이블의 RLS 가 꺼져 있다");
      const [kind] = await tx`select pg_get_constraintdef(oid) as def from pg_constraint where conname = 'personal_planner_kind_check'`;
      if (!kind?.def.includes("range")) throw new Error("개인 일정 제약이 갱신되지 않았다");
      const [cols] = await tx`select count(*)::int as n from information_schema.columns where table_name = 'personal_planner_items' and column_name in ('linked_item_id', 'linked_meeting_id')`;
      if (cols.n !== 2) throw new Error("연결 컬럼이 없다");
      return { status: "applied", migration: TAG, rls: true, linkColumns: cols.n };
    }), null, 2));
  }
} finally {
  await sql.end({ timeout: 5 });
}
