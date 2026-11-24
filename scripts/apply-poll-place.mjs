/**
 * 마이그레이션 0014(일정 투표의 음식 종류·식당·위치)를 운영 DB에 적용한다.
 *
 *   node scripts/apply-poll-place.mjs --check   # 아무것도 바꾸지 않고 상태만 본다
 *   node scripts/apply-poll-place.mjs           # 적용
 *
 * drizzle-kit migrate 를 쓰지 않는 이유는 apply-calendar-meetings.mjs 머리말과 같다.
 * 직전 마이그레이션이 정확히 0013 일 때만 적용하고, 한 트랜잭션이라 중간에 멈춰도 반쯤 적용되지 않는다.
 *
 * 순서: 이 스크립트를 먼저 → 그다음 앱 배포. 배포가 먼저면 새 컬럼을 읽다 일정 투표 화면이 전부 실패한다.
 */
import "./load-env.mjs";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import postgres from "postgres";

const TAG = "0014_poll_place";
const COLUMNS = ["food_type", "restaurant", "location"];
const CHECK_ONLY = process.argv.includes("--check");
/** 해시는 줄바꿈을 LF 로 맞춘 뒤 계산한다(Windows 작업 폴더의 CRLF 가 기준선을 어긋나게 하지 않게). */
const digest = (body) => createHash("sha256").update(body.replace(/\r\n/g, "\n")).digest("hex");
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
    const [cols] = await tx`select count(*)::int as n from information_schema.columns where table_schema = 'public' and table_name = 'polls' and column_name = any(${COLUMNS})`;
    return { last, present: cols.n, baselineOk: last?.hash === priorHash, alreadyApplied: last?.hash === digest(body) };
  };

  if (CHECK_ONLY) {
    const info = await report(sql);
    console.log(JSON.stringify({
      직전_기록: info.last ? `${info.last.hash.slice(0, 12)}…` : "없음",
      기대하는_직전: `${prior.tag} (${priorHash.slice(0, 12)}…)`,
      기준선_일치: info.baselineOk,
      이미_적용됨: info.alreadyApplied,
      새_컬럼_개수: info.present,
      판정: info.alreadyApplied ? "이미 적용됨" : info.baselineOk ? "적용 가능" : "적용 불가: 기준선이 다르다(아무것도 바꾸지 않음)",
    }, null, 2));
  } else {
    console.log(JSON.stringify(await sql.begin(async (tx) => {
      // 같은 스크립트가 동시에 두 번 돌지 않게 잠근다.
      await tx`select pg_advisory_xact_lock(1793000014)`;
      const info = await report(tx);
      if (info.alreadyApplied) return { status: "already-applied" };
      if (!info.baselineOk) throw new Error(`직전 마이그레이션이 ${prior.tag} 이 아니다. 아무것도 바꾸지 않았다`);
      if (info.present > 0) throw new Error("새 컬럼이 이미 일부 있다. 수동 확인이 필요하다");

      for (const statement of body.split("--> statement-breakpoint")) if (statement.trim()) await tx.unsafe(statement);
      await tx`insert into drizzle.__drizzle_migrations (hash, created_at) values (${digest(body)}, ${entry.when})`;

      // 적용 결과 검증: 실패하면 여기서 던져 전체를 되돌린다. 기존 투표는 빈 문자열로 채워진다.
      const [after] = await tx`select count(*)::int as n from information_schema.columns where table_schema = 'public' and table_name = 'polls' and column_name = any(${COLUMNS}) and is_nullable = 'NO'`;
      if (after.n !== COLUMNS.length) throw new Error("새 컬럼이 NOT NULL 로 만들어지지 않았다");
      const [check] = await tx`select count(*)::int as n from pg_constraint where conname = 'polls_place_check'`;
      if (check.n !== 1) throw new Error("길이 제약이 빠졌다");
      const [blank] = await tx`select count(*)::int as n from polls where food_type <> '' or restaurant <> '' or location <> ''`;
      if (blank.n !== 0) throw new Error("기존 투표의 새 컬럼이 빈 값이 아니다");
      return { status: "applied", migration: TAG, columns: COLUMNS.length };
    }), null, 2));
  }
} finally {
  await sql.end({ timeout: 5 });
}
