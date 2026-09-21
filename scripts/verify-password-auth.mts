/** 운영 빌드의 폼·쿠키·DB 세션을 확인하고 이 실행에서 만든 계정만 정리한다. */
import "./load-env.mjs";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { db, sql } from "../src/lib/db/index.js";
import { users, sessions, passwordCredentials, authAttempts } from "../src/lib/db/schema.js";
import { allowAuthAttempt, registerPasswordUser } from "../src/lib/password-auth.js";

const base = process.env.AUTH_TEST_URL ?? "http://127.0.0.1:3100";
const runId = randomUUID();
const email = `auth-check-${runId}@example.invalid`;
const legacyEmail = `legacy-check-${runId}@example.invalid`;
const raceEmail = `race-check-${runId}@example.invalid`;
const limitEmail = `limit-check-${runId}@example.invalid`;
const address = `test-${runId}`;
const password = `Password-${randomUUID()}`;
const emails = [email, legacyEmail, raceEmail];
const cookieName = "__Secure-authjs.session-token";
let cookie = "";

async function request(path: string, init: RequestInit = {}) {
  return fetch(`${base}${path}`, { ...init, redirect: "manual", headers: { Origin: base, ...(cookie ? { Cookie: cookie } : {}), ...init.headers } });
}

async function submit(path: string, fields: Record<string, string>, logout = false, origin = base) {
  const page = await request(path);
  assert.equal(page.status, 200);
  const html = await page.text();
  const forms = [...html.matchAll(/<form\b[^>]*>([\s\S]*?)<\/form>/g)];
  const form = forms.find((item) => logout ? item[1].includes("로그아웃") : item[1].includes('name="password"'))?.[1];
  assert.ok(form, "대상 폼이 렌더되어야 한다");
  const action = form.match(/name="(\$ACTION_ID_[^"]+)"/);
  assert.ok(action, "브라우저 기본 제출을 위한 서버 액션이 있어야 한다");
  const data = new FormData();
  data.set(action[1], "");
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return request(path, { method: "POST", body: data, headers: { Origin: origin } });
}

function assertError(response: Response, code: string) {
  assert.equal(response.status, 303);
  assert.equal(new URL(response.headers.get("location")!, base).searchParams.get("error"), code);
}

try {
  const loginPage = await request("/login");
  const loginHtml = await loginPage.text();
  assert.equal(loginPage.status, 200);
  assert.ok(loginHtml.includes('name="password"'));
  assert.ok(!loginHtml.includes("AUTH_GOOGLE"));
  assert.deepEqual(await (await request("/api/auth/providers")).json(), {});

  assertError(await submit("/login?mode=register", { name: "검증 계정", email, password, passwordConfirm: "mismatch" }), "invalid");
  const crossOrigin = await submit("/login?mode=register", { name: "외부 요청", email, password, passwordConfirm: password }, false, "https://evil.example");
  assert.ok(crossOrigin.status >= 400, "다른 사이트의 인증 폼 제출은 거절해야 한다");
  assert.equal((await db.select().from(users).where(eq(users.email, email))).length, 0);
  const signedUp = await submit("/login?mode=register", { name: "검증 계정", email: email.toUpperCase(), password, passwordConfirm: password, returnTo: "/join/test-invite" });
  assert.equal(signedUp.status, 303);
  assert.equal(signedUp.headers.get("location"), "/join/test-invite");
  const sessionHeader = signedUp.headers.getSetCookie().find((value) => value.startsWith(`${cookieName}=`));
  assert.ok(sessionHeader);
  assert.match(sessionHeader, /HttpOnly/i);
  assert.match(sessionHeader, /Secure/i);
  assert.match(sessionHeader, /SameSite=lax/i);
  cookie = sessionHeader.split(";")[0];
  const signedIn = await (await request("/api/auth/session")).json();
  assert.equal(signedIn.user.email, email);
  const [credential] = await db.select().from(passwordCredentials).where(eq(passwordCredentials.email, email));
  assert.ok(credential.passwordHash.startsWith("scrypt-v1$"));
  assert.ok(!credential.passwordHash.includes(password));
  const [user] = await db.select().from(users).where(eq(users.id, credential.userId));
  assert.equal(user.emailVerified, null);
  console.log("PASS 가입·이메일 정규화·비밀번호 해시·보안 쿠키·DB 세션·초대 복귀");

  const firstToken = cookie.slice(cookie.indexOf("=") + 1);
  const signedOut = await submit("/", {}, true);
  assert.equal(signedOut.status, 303);
  assert.equal((await db.select().from(sessions).where(eq(sessions.sessionToken, firstToken))).length, 0);
  assert.equal(await (await request("/api/auth/session")).json(), null);
  cookie = "";
  console.log("PASS 로그아웃 시 세션 폐기");

  assertError(await submit("/login", { email, password: "incorrect-password-123" }), "credentials");
  assertError(await submit("/login?mode=register", { name: "중복", email, password, passwordConfirm: password }), "unavailable");
  const loggedIn = await submit("/login", { email, password, returnTo: "https://evil.example" });
  assert.equal(loggedIn.status, 303);
  assert.equal(loggedIn.headers.get("location"), "/");
  cookie = loggedIn.headers.getSetCookie().find((value) => value.startsWith(`${cookieName}=`))!.split(";")[0];
  const secondToken = cookie.slice(cookie.indexOf("=") + 1);
  assert.notEqual(firstToken, secondToken);
  await db.update(sessions).set({ expires: new Date(Date.now() - 1000) }).where(eq(sessions.sessionToken, secondToken));
  assert.equal(await (await request("/api/auth/session")).json(), null);
  console.log("PASS 잘못된 비밀번호·중복 가입 거부·재로그인·외부 리디렉션 차단·만료 세션 거부");

  await db.insert(users).values({ name: "기존 계정 검증", email: legacyEmail });
  assert.equal(await registerPasswordUser({ email: legacyEmail, name: "덮어쓰기", password }), null);
  assert.equal((await db.select().from(passwordCredentials).where(eq(passwordCredentials.email, legacyEmail))).length, 0);
  const race = await Promise.all([
    registerPasswordUser({ email: raceEmail, name: "동시 가입 1", password }),
    registerPasswordUser({ email: raceEmail, name: "동시 가입 2", password }),
  ]);
  assert.equal(race.filter(Boolean).length, 1);
  const allowed = await Promise.all(Array.from({ length: 11 }, () => allowAuthAttempt(limitEmail, address)));
  assert.equal(allowed.filter(Boolean).length, 10);
  console.log("PASS 기존 계정 탈취 방지·동시 중복 가입 방지·공유 DB 로그인 시도 제한");
} finally {
  await db.delete(users).where(inArray(users.email, emails));
  const keys = [email, legacyEmail, raceEmail, limitEmail].map((value) => createHash("sha256").update(`email:${value}`).digest("hex"));
  keys.push(createHash("sha256").update(`address:${address}`).digest("hex"));
  await db.delete(authAttempts).where(inArray(authAttempts.key, keys));
  await sql.end();
}
