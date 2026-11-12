import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import {
  hashLinkToken,
  hashSessionToken,
  isHashedSessionToken,
  isSealedLinkToken,
  openLinkToken,
  sealLinkToken,
  withHashedSessions,
} from "./token-store.js";
import { linkToken } from "./utils.js";

const SECRET = "test-secret-at-least-32-characters-long";

test("세션 토큰은 접두사 붙은 sha256으로 저장한다", () => {
  const token = "a".repeat(64);
  const hashed = hashSessionToken(token);
  assert.equal(hashed, "sha256:" + createHash("sha256").update(token).digest("hex"));
  assert.ok(isHashedSessionToken(hashed));
  assert.ok(!isHashedSessionToken(token));
});

type Row = { sessionToken: string; userId: string; expires: Date };

/** sessions 테이블 하나를 흉내 내는 어댑터 */
function fakeAdapter(rows: Map<string, Row>) {
  return {
    createSession: async (s: Row) => { rows.set(s.sessionToken, s); return s; },
    getSessionAndUser: async (token: string) => {
      const session = rows.get(token);
      return session ? { session, user: { id: session.userId, email: "", emailVerified: null } } : null;
    },
    updateSession: async (s: Partial<Row> & { sessionToken: string }) => {
      const row = rows.get(s.sessionToken);
      if (!row) return null;
      Object.assign(row, s);
      return row;
    },
    deleteSession: async (token: string) => { rows.delete(token); },
  };
}

test("어댑터는 해시로 저장·조회하고 Auth.js에는 원래 토큰을 돌려준다", async () => {
  const rows = new Map<string, Row>();
  const adapter = withHashedSessions(fakeAdapter(rows), async () => {});
  const expires = new Date(Date.now() + 1000);
  const created = await adapter.createSession({ sessionToken: "cookie-value", userId: "u1", expires });
  assert.equal(created.sessionToken, "cookie-value");
  assert.deepEqual([...rows.keys()], [hashSessionToken("cookie-value")]);

  const found = await adapter.getSessionAndUser("cookie-value");
  assert.equal(found?.session.sessionToken, "cookie-value");
  assert.equal(found?.user.id, "u1");

  await adapter.deleteSession("cookie-value");
  assert.equal(rows.size, 0);
});

test("옛 평문 세션은 처음 조회될 때 해시로 바뀌고 로그아웃되지 않는다", async () => {
  const rows = new Map<string, Row>([["legacy", { sessionToken: "legacy", userId: "u1", expires: new Date(Date.now() + 1000) }]]);
  const renamed: string[] = [];
  const adapter = withHashedSessions(fakeAdapter(rows), async (old, hashed) => {
    const row = rows.get(old)!;
    rows.delete(old);
    rows.set(hashed, { ...row, sessionToken: hashed });
    renamed.push(old);
  });
  const found = await adapter.getSessionAndUser("legacy");
  assert.equal(found?.user.id, "u1");
  assert.deepEqual(renamed, ["legacy"]);
  assert.ok(rows.has(hashSessionToken("legacy")));
  assert.ok(!rows.has("legacy"));
  // 두 번째부터는 해시로 찾는다
  assert.equal((await adapter.getSessionAndUser("legacy"))?.user.id, "u1");
  assert.equal(renamed.length, 1);
});

test("DB에서 읽은 해시 값을 쿠키로 내밀어도 로그인되지 않는다", async () => {
  const hashed = hashSessionToken("cookie-value");
  const rows = new Map<string, Row>([[hashed, { sessionToken: hashed, userId: "u1", expires: new Date(Date.now() + 1000) }]]);
  const adapter = withHashedSessions(fakeAdapter(rows), async () => { throw new Error("rename 금지"); });
  assert.equal(await adapter.getSessionAndUser(hashed), null);
});

test("링크 토큰 조회 키는 마이그레이션 SQL과 같은 sha256 hex다", () => {
  // encode(sha256(convert_to('abc','UTF8')),'hex')
  assert.equal(hashLinkToken("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("표시용 사본은 암호화되고 같은 키로만 풀린다", () => {
  const token = linkToken();
  const sealed = sealLinkToken(token, SECRET);
  assert.ok(isSealedLinkToken(sealed));
  assert.ok(!sealed.includes(token));
  assert.notEqual(sealLinkToken(token, SECRET), sealed, "IV가 매번 달라야 한다");
  assert.equal(openLinkToken(sealed, SECRET), token);
  assert.equal(openLinkToken(sealed, "another-secret-another-secret-123"), null);
  // 0008 이전 평문 행은 그대로 읽힌다
  assert.equal(openLinkToken("legacyplaintext", SECRET), "legacyplaintext");
});

test("링크 토큰은 128비트 base64url 22자다", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 200; i++) {
    const token = linkToken();
    assert.match(token, /^[A-Za-z0-9_-]{22}$/);
    seen.add(token);
  }
  assert.equal(seen.size, 200);
  // 초대 복귀 경로 검사(login-input의 /join/[a-zA-Z0-9_-]+)를 그대로 통과한다
  assert.match(`/join/${linkToken()}`, /^\/join\/[a-zA-Z0-9_-]+$/);
});
