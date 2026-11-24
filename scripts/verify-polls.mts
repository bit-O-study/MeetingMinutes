/**
 * 일정 투표 검증 (DB 제약 + 화면 렌더)
 *
 *   npm run dev -- --port 3210        # 다른 터미널에서
 *   npx tsx scripts/verify-polls.mts http://localhost:3210
 *
 * 개발도 운영 DB 에 붙으므로(docs/INTERNAL-DATABASE.md) 임시 계정·투표를 만들고 끝나면 전부 지운다.
 * 도중에 죽어도 다음 실행이 같은 접두사(poll-verify-)의 잔여물을 먼저 치운다.
 *
 * 하지 않는 것: 서버 액션(submitVote 등) 호출. 세션·쿠키가 걸린 액션은 브라우저 흐름으로 확인한다.
 */
import "./load-env.mjs";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq, like } from "drizzle-orm";

import { db, sql } from "../src/lib/db";
import { pollExcludedDays, pollParticipants, pollUnavailableDays, polls, sessions, users } from "../src/lib/db/schema";
import { hashEditToken, pollCookieName } from "../src/lib/poll-identity";
import { sessionCookie } from "../src/lib/session-cookie";
import { hashSessionToken, storedLinkToken } from "../src/lib/token-store";
import { linkToken } from "../src/lib/utils";

const base = (process.argv[2] ?? "http://localhost:3210").replace(/\/$/, "");
const PREFIX = "poll-verify-";
const results: string[] = [];
const ok = (name: string) => { results.push(`✓ ${name}`); console.log(`✓ ${name}`); };

async function rejects(name: string, run: () => Promise<unknown>, code = "23") {
  try { await run(); } catch (error) {
    const e = error as { code?: string; cause?: { code?: string } };
    const got = e.code ?? e.cause?.code ?? "";
    assert.ok(got.startsWith(code), `${name}: 예상한 제약 위반이 아니다 (${got || String(error)})`);
    return ok(name);
  }
  assert.fail(`${name}: 거절되어야 하는데 통과했다`);
}

async function cleanup() {
  const stale = await db.select({ id: users.id }).from(users).where(like(users.email, `${PREFIX}%`));
  for (const { id } of stale) {
    await db.delete(polls).where(eq(polls.ownerId, id));
    await db.delete(sessions).where(eq(sessions.userId, id));
    await db.delete(users).where(eq(users.id, id));
  }
}

await cleanup();
try {
  const [owner] = await db.insert(users).values({ name: "소유자홍길동", email: `${PREFIX}${randomUUID().slice(0, 8)}@dev.local`, emailVerified: new Date() }).returning();
  const session = randomUUID() + randomUUID().replace(/-/g, "");
  await db.insert(sessions).values({ sessionToken: hashSessionToken(session), userId: owner.id, expires: new Date(Date.now() + 3_600_000) });

  const token = linkToken();
  const stored = storedLinkToken(token);
  const [poll] = await db.insert(polls).values({
    ownerId: owner.id, title: "검증 송년 스터디", description: "검증용 설명", foodType: "한식검증", restaurant: "식당검증", location: "위치검증",
    rangeStart: "2026-12-01", rangeEnd: "2026-12-31", respondBy: new Date(Date.now() + 6 * 86_400_000),
    token: stored.token, tokenHash: stored.tokenHash,
  }).returning();
  await db.insert(pollExcludedDays).values([{ pollId: poll.id, day: "2026-12-24", reason: "성탄 전야" }, { pollId: poll.id, day: "2026-12-25", reason: "" }]);
  ok("투표·제외일 삽입");

  /* ── DB 제약 ── */
  await rejects("기간 60일 초과 거절", () => db.insert(polls).values({ ownerId: owner.id, title: "x", rangeStart: "2026-12-01", rangeEnd: "2027-02-01", token: "t", tokenHash: randomUUID() }));
  await rejects("끝이 시작보다 빠른 기간 거절", () => db.insert(polls).values({ ownerId: owner.id, title: "x", rangeStart: "2026-12-05", rangeEnd: "2026-12-01", token: "t", tokenHash: randomUUID() }));
  await rejects("빈 제목 거절", () => db.insert(polls).values({ ownerId: owner.id, title: "  ", rangeStart: "2026-12-01", rangeEnd: "2026-12-02", token: "t", tokenHash: randomUUID() }));
  await rejects("같은 토큰 해시 거절", () => db.insert(polls).values({ ownerId: owner.id, title: "x", rangeStart: "2026-12-01", rangeEnd: "2026-12-02", token: "t", tokenHash: stored.tokenHash }));
  await rejects("confirmed 인데 날짜 없음 거절", () => db.update(polls).set({ status: "confirmed" }).where(eq(polls.id, poll.id)));
  await rejects("날짜가 있는데 confirmed 아님 거절", () => db.update(polls).set({ confirmedDay: "2026-12-11" }).where(eq(polls.id, poll.id)));
  await rejects("너무 긴 위치 거절", () => db.update(polls).set({ location: "가".repeat(101) }).where(eq(polls.id, poll.id)));
  await rejects("알 수 없는 상태 거절", () => db.update(polls).set({ status: "weird" as never }).where(eq(polls.id, poll.id)));

  const editToken = "verify-edit-token";
  const [guest] = await db.insert(pollParticipants).values({ pollId: poll.id, displayName: "게스트민수", nameKey: "게스트민수", editTokenHash: hashEditToken(editToken) }).returning();
  await db.insert(pollUnavailableDays).values([{ participantId: guest.id, day: "2026-12-03" }, { participantId: guest.id, day: "2026-12-04" }]);
  await db.insert(pollParticipants).values({ pollId: poll.id, userId: owner.id, displayName: "회원지은", nameKey: "회원지은" });
  ok("참여자(비회원·회원) 삽입");
  await rejects("같은 이름 두 번째 참여자 거절", () => db.insert(pollParticipants).values({ pollId: poll.id, displayName: "게스트 민수", nameKey: "게스트민수" }));
  await rejects("같은 회원의 두 번째 응답 거절", () => db.insert(pollParticipants).values({ pollId: poll.id, userId: owner.id, displayName: "다른이름", nameKey: "다른이름" }));
  await rejects("같은 날 불가 중복 거절", () => db.insert(pollUnavailableDays).values({ participantId: guest.id, day: "2026-12-03" }));
  await db.insert(pollParticipants).values([{ pollId: poll.id, displayName: "익명1", nameKey: "익명1" }, { pollId: poll.id, displayName: "익명2", nameKey: "익명2" }]);
  ok("user_id 가 없는 참여자는 여럿 허용");

  /* ── 화면 렌더 ── */
  const get = async (path: string, cookie = "") => {
    const res = await fetch(`${base}${path}`, { headers: cookie ? { cookie } : {}, redirect: "manual" });
    // React 가 인접한 텍스트 사이에 끼우는 <!-- --> 를 지워야 문장 단위로 비교할 수 있다.
    return { status: res.status, html: (await res.text()).replace(/<!-- -->/g, ""), headers: res.headers };
  };
  const login = `${sessionCookie.name}=${session}`;

  const list = await get("/polls", login);
  assert.equal(list.status, 200); assert.ok(list.html.includes("검증 송년 스터디"), "목록에 내 투표가 보여야 한다");
  ok("/polls 목록 렌더");

  const create = await get("/polls/new", login);
  assert.equal(create.status, 200); assert.ok(create.html.includes("새 일정 투표") && create.html.includes("마감 (선택)") && create.html.includes("음식 종류") && create.html.includes("식당") && create.html.includes("위치"));
  ok("/polls/new 렌더(음식·식당·위치·마감)");

  const manage = await get(`/polls/${poll.id}`, login);
  assert.equal(manage.status, 200);
  for (const text of ["검증 송년 스터디", "게스트민수", "회원지은", "날짜별 안 되는 인원", "마감 시각 바꾸기", "+1일 연장", "참여 링크", `/v/${token}`]) assert.ok(manage.html.includes(text), `관리 화면에 "${text}" 가 있어야 한다`);
  ok("/polls/[id] 관리 화면 렌더(이름·집계·마감 관리·링크)");

  const anonymousManage = await get(`/polls/${poll.id}`);
  assert.ok(anonymousManage.status !== 200 || !anonymousManage.html.includes("검증 송년 스터디"), "로그인 없이 관리 화면이 열리면 안 된다");
  ok("로그인 없이 관리 화면 차단");

  const [other] = await db.insert(users).values({ name: "다른사람", email: `${PREFIX}${randomUUID().slice(0, 8)}@dev.local`, emailVerified: new Date() }).returning();
  const otherSession = randomUUID() + randomUUID().replace(/-/g, "");
  await db.insert(sessions).values({ sessionToken: hashSessionToken(otherSession), userId: other.id, expires: new Date(Date.now() + 3_600_000) });
  const foreign = await get(`/polls/${poll.id}`, `${sessionCookie.name}=${otherSession}`);
  const missing = await get(`/polls/${randomUUID()}`, `${sessionCookie.name}=${otherSession}`);
  assert.ok(!foreign.html.includes("검증 송년 스터디") && !foreign.html.includes("게스트민수"), "남의 투표 내용이 새면 안 된다");
  assert.equal(foreign.status, missing.status, "남의 투표와 없는 투표는 같은 상태 코드여야 한다");
  ok("남의 투표 = 없는 투표(같은 응답, 내용 미노출)");

  const pub = await get(`/v/${token}`);
  assert.equal(pub.status, 200);
  for (const text of ["검증 송년 스터디", "이름 또는 닉네임", "안 되는 날", "마감", "한식검증", "식당검증", "위치검증"]) assert.ok(pub.html.includes(text), `공개 화면에 "${text}" 가 있어야 한다`);
  for (const secret of ["게스트민수", "회원지은", "소유자홍길동", owner.id, owner.email!]) assert.ok(!pub.html.includes(secret), `공개 화면에 "${secret}" 가 새면 안 된다`);
  assert.equal(pub.headers.get("referrer-policy"), "no-referrer");
  assert.match(pub.headers.get("x-robots-tag") ?? "", /noindex/);
  assert.match(pub.headers.get("cache-control") ?? "", /no-store/);
  ok("/v/[token] 비로그인 렌더, 참여자 이름·소유자 정보 미노출, 보안 헤더");

  const mine = await get(`/v/${token}`, `${pollCookieName(poll.id)}=${editToken}`);
  assert.ok(mine.html.includes("제출 완료"), "쿠키가 맞으면 내 응답을 알아봐야 한다");
  assert.ok(!mine.html.includes("회원지은"), "다른 참여자 이름은 여전히 안 보여야 한다");
  const wrong = await get(`/v/${token}`, `${pollCookieName(poll.id)}=wrong-token`);
  assert.ok(!wrong.html.includes("제출 완료"), "틀린 쿠키로 남의 응답을 열면 안 된다");
  ok("쿠키로 내 응답 복원, 틀린 쿠키 거절, 결과는 숫자만");

  const bad = await get("/v/not-a-real-token-123456");
  assert.ok(bad.html.includes("링크를 열 수 없습니다"));
  await db.update(polls).set({ revokedAt: new Date() }).where(eq(polls.id, poll.id));
  const revoked = await get(`/v/${token}`);
  assert.ok(revoked.html.includes("링크를 열 수 없습니다") && !revoked.html.includes("검증 송년 스터디"));
  await db.update(polls).set({ revokedAt: null }).where(eq(polls.id, poll.id));
  ok("없는 토큰·폐기된 링크는 같은 '열 수 없는 링크'");

  await db.update(polls).set({ respondBy: new Date(Date.now() - 60_000) }).where(eq(polls.id, poll.id));
  const closed = await get(`/v/${token}`);
  assert.ok(closed.html.includes("투표가 마감됐어요") && !closed.html.includes("제출하기"), "마감 시각이 지나면 읽기 전용이어야 한다");
  await db.update(polls).set({ respondBy: new Date(Date.now() + 86_400_000) }).where(eq(polls.id, poll.id));
  const reopened = await get(`/v/${token}`);
  assert.ok(reopened.html.includes("제출하기"), "마감 시각을 미래로 늘리면 status 변경 없이 다시 열려야 한다");
  ok("마감 시각 경과 → 읽기 전용, 연장 → 즉시 다시 열림");

  await db.update(polls).set({ status: "confirmed", confirmedDay: "2026-12-11" }).where(eq(polls.id, poll.id));
  const confirmed = await get(`/v/${token}`);
  assert.ok(confirmed.html.includes("12월 11일 (금)") && confirmed.html.includes("확정된 날짜"));
  ok("확정 날짜 표시");

  /* ── 삭제 연쇄 ── */
  await db.delete(polls).where(eq(polls.id, poll.id));
  const [left] = await sql`select (select count(*) from poll_participants where poll_id = ${poll.id})::int as p, (select count(*) from poll_excluded_days where poll_id = ${poll.id})::int as e, (select count(*) from poll_unavailable_days where participant_id = ${guest.id})::int as u`;
  assert.deepEqual({ ...left }, { p: 0, e: 0, u: 0 });
  ok("투표 삭제 시 제외일·참여자·불가일 연쇄 삭제");
} finally {
  await cleanup();
  const [left] = await sql`select count(*)::int as n from users where email like ${PREFIX + "%"}`;
  console.log(`정리 완료 (남은 임시 계정 ${left.n}개)`);
  await sql.end({ timeout: 5 });
}
console.log(`\n${results.length}개 통과`);
