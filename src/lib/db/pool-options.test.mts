import assert from "node:assert/strict";
import { test } from "node:test";
import { poolOptions } from "./pool-options.js";

// 회귀 방지(2026-10-31): 조용히 끊긴 연결에 쿼리가 끝없이 매달려 자료실·통계가 멈췄다.
test("연결을 주기적으로 새로 맺고 죽은 소켓·새 연결 대기에 시간 제한을 둔다", () => {
  const options = poolOptions({ NODE_ENV: "production" });
  assert.equal(options.max_lifetime, 600);
  assert.equal(options.keep_alive, 15);
  assert.equal(options.connect_timeout, 10);
  assert.equal(options.idle_timeout, 20);
  assert.ok(options.max_lifetime > options.idle_timeout);
});

test("운영 풀 상한은 DATABASE_POOL_MAX(기본 3), 개발은 1", () => {
  assert.equal(poolOptions({ NODE_ENV: "production" }).max, 3);
  assert.equal(poolOptions({ NODE_ENV: "production", DATABASE_POOL_MAX: "5" }).max, 5);
  assert.equal(poolOptions({ NODE_ENV: "development", DATABASE_POOL_MAX: "5" }).max, 1);
});

test("풀러 전제(prepared statement 끔·SSL 필수)는 그대로", () => {
  const options = poolOptions({});
  assert.equal(options.prepare, false);
  assert.equal(options.ssl, "require");
});
