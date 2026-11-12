import assert from "node:assert/strict";
import { test } from "node:test";

import { authAttemptBuckets, authAttemptKeysToClear } from "./auth-attempt-buckets.js";

test("가장 빡빡한 이메일 제한은 이메일+주소 단위다 — 남의 주소에서 계정을 잠글 수 없다", () => {
  const victimHome = authAttemptBuckets("victim@example.com", "1.1.1.1");
  const attacker = authAttemptBuckets("victim@example.com", "6.6.6.6");

  // 10회 버킷은 주소마다 다르다
  assert.equal(victimHome[0].limit, 10);
  assert.notEqual(victimHome[0].key, attacker[0].key);
  // 분산 공격을 막는 이메일 전체 버킷은 공유하지만 한도가 훨씬 크다
  assert.equal(victimHome[1].key, attacker[1].key);
  assert.ok(victimHome[1].limit >= 100);
  // 주소 버킷은 이메일과 무관하다
  assert.equal(authAttemptBuckets("x@example.com", "6.6.6.6")[2].key, attacker[2].key);
});

test("키는 범위끼리 섞이지 않는다", () => {
  const [pair, email, address] = authAttemptBuckets("a@b.c", "a@b.c");
  assert.equal(new Set([pair.key, email.key, address.key]).size, 3);
  // 경계 문자를 이용해 다른 조합과 같은 키를 만들 수 없다
  assert.notEqual(authAttemptBuckets("a@b.c", "x")[0].key, authAttemptBuckets("a@b.c\nx", "")[0].key);
});

test("성공하면 그 이메일의 버킷만 지우고 주소 버킷은 남긴다", () => {
  const buckets = authAttemptBuckets("a@b.c", "1.1.1.1");
  const cleared = authAttemptKeysToClear("a@b.c", "1.1.1.1");
  assert.deepEqual(cleared, [buckets[0].key, buckets[1].key]);
  assert.ok(!cleared.includes(buckets[2].key));
});
