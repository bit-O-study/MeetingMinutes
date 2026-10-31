import assert from "node:assert/strict";
import { test } from "node:test";
import { resilientSql } from "./resilient.js";

// postgres.js 흉내: 태그 호출은 promise, options.parsers/serializers, end().
function fakeSql(name: string, hang: boolean, log: string[]) {
  const fn = ((strings: TemplateStringsArray) => {
    log.push(`${name}:${strings.join("?")}`);
    return hang ? new Promise(() => {}) : Promise.resolve([{ "?column?": 1 }]);
  }) as unknown as Record<string, unknown>;
  fn.options = { parsers: {} as Record<string, unknown>, serializers: {} as Record<string, unknown> };
  fn.ended = null;
  fn.end = (opts: unknown) => { fn.ended = opts; return Promise.resolve(); };
  fn.unsafe = (q: string) => { log.push(`${name}:unsafe ${q}`); return Promise.resolve([]); };
  return fn;
}

// 회귀 방지(2026-10-31): 풀이 풀러에서 응답 없이 멈춰 자료실·통계가 재시작 전까지 멈췄다.
test("멈춘 풀은 새 풀로 바꾸고 옛 풀은 즉시 닫는다(파서 설정도 옮김)", async () => {
  const log: string[] = [];
  const made: Record<string, unknown>[] = [];
  const { sql, probe, stop } = resilientSql(() => {
    const s = fakeSql(`pool${made.length + 1}`, made.length === 0, log);
    made.push(s);
    return s as never;
  }, { probeEveryMs: 60_000, probeTimeoutMs: 20, log: () => {} });
  try {
    (made[0].options as { parsers: Record<string, unknown> }).parsers["1184"] = "drizzle";
    assert.equal(await probe(), false);
    assert.equal(made.length, 2);
    assert.deepEqual(made[0].ended, { timeout: 0 });
    assert.equal((made[1].options as { parsers: Record<string, unknown> }).parsers["1184"], "drizzle");
    await (sql as unknown as (s: TemplateStringsArray) => Promise<unknown>)(Object.assign(["select 2"], { raw: ["select 2"] }));
    await (sql as unknown as { unsafe: (q: string) => Promise<unknown> }).unsafe("select 3");
    assert.ok(log.includes("pool2:select 2") && log.includes("pool2:unsafe select 3"), "새 풀로 간다");
  } finally { stop(); }
});

test("응답하는 풀은 그대로 둔다", async () => {
  const made: unknown[] = [];
  const { probe, stop } = resilientSql(() => { const s = fakeSql("ok", false, []); made.push(s); return s as never; }, { probeEveryMs: 60_000, probeTimeoutMs: 50, log: () => {} });
  try {
    assert.equal(await probe(), true);
    assert.equal(made.length, 1);
  } finally { stop(); }
});
