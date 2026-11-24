/**
 * 일정 투표 브라우저 검증 — 서버 액션(만들기·제출·연장·마감·확정·삭제)까지 실제 화면으로 돌려 본다.
 *
 *   npm run dev -- --port 3210
 *   PW_MODULE=<playwright-core 경로> CHROME_PATH=<chrome.exe> npx tsx scripts/verify-polls-ui.mts http://localhost:3210
 *
 * 임시 계정·투표를 만들고 끝나면 지운다(개발도 운영 DB 에 붙는다). 이 저장소는 playwright 를 의존성으로 두지 않는다.
 */
import "./load-env.mjs";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { eq, like } from "drizzle-orm";

import { db, sql } from "../src/lib/db";
import { polls, sessions, users } from "../src/lib/db/schema";
import { addDays } from "../src/lib/calendar-dates";
import { sessionCookie } from "../src/lib/session-cookie";
import { hashSessionToken } from "../src/lib/token-store";
import { todayInSeoul } from "../src/lib/utils";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_MODULE ?? "playwright-core");
const base = (process.argv[2] ?? "http://localhost:3210").replace(/\/$/, "");
const host = new URL(base).hostname;
const PREFIX = "poll-ui-verify-";
const done = (name: string) => console.log(`✓ ${name}`);

async function until<T>(label: string, fn: () => Promise<T | false | null | undefined>, ms = 15_000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const value = await fn().catch(() => false);
    if (value) return value as T;
    if (Date.now() > end) throw new Error(`시간 초과: ${label}`);
    await new Promise((r) => setTimeout(r, 250));
  }
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
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH, headless: true } : { headless: true });
try {
  const [owner] = await db.insert(users).values({ name: "UI검증소유자", email: `${PREFIX}${randomUUID().slice(0, 8)}@dev.local`, emailVerified: new Date() }).returning();
  const sessionValue = randomUUID() + randomUUID().replace(/-/g, "");
  await db.insert(sessions).values({ sessionToken: hashSessionToken(sessionValue), userId: owner.id, expires: new Date(Date.now() + 3_600_000) });

  const ownerCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ownerCtx.addCookies([{ name: sessionCookie.name, value: sessionValue, domain: host, path: "/" }]);
  const dialogs: string[] = [];
  const op = await ownerCtx.newPage();
  op.on("dialog", (d: { message(): string; accept(): Promise<void> }) => { dialogs.push(d.message()); void d.accept(); });
  const problems: string[] = [];
  op.on("pageerror", (e: Error) => problems.push(`pageerror: ${e.message}`));
  op.on("console", (m: { type(): string; text(): string }) => { if (m.type() === "error") problems.push(`console: ${m.text()}`); });

  /* 1. 만들기 */
  await op.goto(`${base}/polls/new`);
  await op.getByLabel("제목").fill("UI 검증 투표");
  await op.getByLabel("음식 종류").fill("한식검증");
  await op.getByLabel("식당").fill("식당검증");
  await op.getByLabel("위치").fill("위치검증");

  // 달력은 "안 되는 날"을 누르는 것 하나뿐이다.
  const firstDay = op.getByRole("button", { name: /^\d+월 \d+일 \(.\)$/ }).first();
  const excludedLabel = (await firstDay.getAttribute("aria-label"))!;
  await op.getByText("후보 14일").waitFor();
  await firstDay.click();
  await op.getByText("후보 13일").waitFor();
  assert.equal(await op.getByRole("button", { name: `${excludedLabel}, 제외` }).getAttribute("aria-pressed"), "true");
  done(`안 되는 날 클릭 → 후보 14일에서 13일 [${excludedLabel}]`);

  await op.getByLabel("마감 (선택)").fill("2020-01-01T10:00");
  await op.getByText("이미 지난 시각이에요").waitFor();
  assert.equal(await op.getByRole("button", { name: "투표 만들기" }).isDisabled(), true);
  done("지난 마감 시각은 경고하고 만들기를 막는다");
  await op.getByLabel("마감 (선택)").fill(`${addDays(todayInSeoul(), 3)}T18:00`);
  await op.getByRole("button", { name: "투표 만들기" }).click();
  await op.waitForURL(/\/polls\/[0-9a-f-]{36}\?created=1/);
  const pollId = op.url().match(/\/polls\/([0-9a-f-]{36})/)![1];
  await op.getByText("투표를 만들었어요").waitFor();
  const infoText = await op.locator("header").innerText();
  assert.ok(["한식검증", "식당검증", "위치검증"].every((t) => infoText.includes(t)), "관리 화면에 음식·식당·위치가 보여야 한다");
  const shareUrl = await op.getByLabel("공유 링크").inputValue();
  const token = shareUrl.match(/\/v\/([\w-]{8,})/)![1];
  done("투표 만들기(서버 액션) → 관리 화면 이동, 음식·식당·위치 표시, 링크 발급");

  /* 2. 비회원 참여 */
  const guestCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const gp = await guestCtx.newPage();
  gp.on("pageerror", (e: Error) => problems.push(`guest pageerror: ${e.message}`));
  await gp.goto(`${base}/v/${token}`);
  await gp.getByText("UI 검증 투표").first().waitFor();
  const guestHead = await gp.locator("header").innerText();
  assert.ok(["한식검증", "식당검증", "위치검증"].every((t) => guestHead.includes(t)), "참여 화면에 음식·식당·위치가 보여야 한다");
  done("참여 화면에 음식·식당·위치 표시");
  const dayButtons = gp.getByRole("button", { name: /, 가능$/ });
  assert.equal(await dayButtons.first().isDisabled(), true, "이름 전에는 캘린더가 잠겨 있어야 한다");
  assert.equal(await gp.getByRole("button", { name: "제출하기" }).isDisabled(), true);
  done("이름 입력 전 캘린더·제출 잠김");

  // 날짜 라벨의 괄호는 정규식 특수문자이므로 문자열 그대로 찾는다.
  assert.equal(await gp.getByRole("button", { name: `${excludedLabel}, 후보 아님` }).isDisabled(), true);
  done("제외일은 참여자 화면에서 선택 불가");

  await gp.locator("#poll-name").fill("게스트A");
  await dayButtons.nth(1).click();
  await dayButtons.nth(2).click();
  const marked = (await gp.getByRole("button", { name: /, 안 됨$/ }).count());
  assert.equal(marked, 2);
  await gp.getByRole("button", { name: "제출하기" }).click();
  await gp.getByText("제출 완료").waitFor();
  const cookies = await guestCtx.cookies();
  assert.ok(cookies.some((c: { name: string; httpOnly: boolean }) => c.name === `pv_${pollId}` && c.httpOnly), "수정용 쿠키(HttpOnly)가 있어야 한다");
  done("비회원 제출(서버 액션) → 쿠키 발급, 완료 안내");

  await gp.reload();
  assert.equal(await gp.locator("#poll-name").inputValue(), "게스트A");
  assert.equal(await gp.getByRole("button", { name: /, 안 됨$/ }).count(), 2);
  done("새로고침 후 이름·체크 복원");

  // 이름을 바꿔 다시 제출해도 같은 응답이 갱신된다(새 참여자가 생기지 않는다).
  await gp.getByRole("button", { name: /, 안 됨$/ }).first().click();
  await gp.getByRole("button", { name: "수정해서 제출" }).click();
  await gp.getByRole("button", { name: "제출됨" }).waitFor();
  assert.equal(await gp.getByRole("button", { name: /, 안 됨$/ }).count(), 1);
  done("같은 기기에서 수정 제출");

  const guest2Ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const g2 = await guest2Ctx.newPage();
  await g2.goto(`${base}/v/${token}`);
  await g2.locator("#poll-name").fill(" 게스트 a ");
  await g2.getByRole("button", { name: "제출하기" }).click();
  await g2.getByText("이미 쓰는 이름이에요").waitFor();
  done("다른 기기에서 같은 이름(공백·대소문자만 다름)은 거절");
  await g2.locator("#poll-name").fill("게스트B");
  await g2.getByRole("button", { name: "제출하기" }).click();
  await g2.getByText("제출 완료").waitFor();
  assert.equal((await g2.locator("body").innerText()).includes("게스트A"), false, "다른 참여자 이름이 보이면 안 된다");
  done("전부 가능으로 제출, 다른 참여자 이름 미노출");

  /* 3. 만든 사람: 마감 관리 */
  await op.reload();
  await op.getByText("응답한 사람 2명").waitFor();
  // 결과: 날짜마다 "총 N명 중 M명 안 됨"만 보이고, 날짜를 누르면 누가 안 되는지 이름이 나온다.
  const oneNo = op.getByRole("button", { name: /총 2명 중 1명 안 됨/ }).first();
  await oneNo.waitFor();
  await oneNo.click();
  await op.getByText("비참석자 1명").waitFor();
  await op.getByText("참석자 1명", { exact: true }).waitFor();
  const panel = op.locator("section", { hasText: "비참석자 1명" });
  assert.ok((await panel.innerText()).includes("게스트A"), "비참석자 칸에 게스트A 가 있어야 한다");
  assert.ok((await panel.innerText()).includes("게스트B"), "참석자 칸에 게스트B 가 있어야 한다");
  assert.equal(await op.getByText(/명 가능/).count(), 0, "'가능' 인원 표기는 더 이상 없어야 한다");
  done("날짜별 '총 N명 중 M명 안 됨', 날짜 클릭 시 안 되는/되는 사람 이름 표시");
  const deadlineBox = op.locator("section", { hasText: "마감 시각 바꾸기" });
  const before = (await db.select().from(polls).where(eq(polls.id, pollId)))[0];
  await op.getByRole("button", { name: "+1일 연장" }).click();
  const after = await until("마감 +1일", async () => {
    const [row] = await db.select().from(polls).where(eq(polls.id, pollId));
    return row.respondBy && before.respondBy && row.respondBy.getTime() - before.respondBy.getTime() === 86_400_000 ? row : false;
  });
  assert.equal(after.version, before.version + 1);
  done("+1일 연장: 현재 마감 시각에 정확히 24시간 더해짐, 버전 증가");

  await op.getByRole("button", { name: "마감 없애기" }).click();
  await until("마감 해제", async () => (await db.select().from(polls).where(eq(polls.id, pollId)))[0].respondBy === null);
  await deadlineBox.getByText("마감 시각 없음").waitFor();
  done("마감 없애기");

  await op.getByLabel("마감 시각 바꾸기").fill("2020-01-01T10:00");
  await op.getByRole("button", { name: "적용" }).click();
  await op.getByRole("alert").getByText("지금보다 뒤의 시각을 골라 주세요.").waitFor();
  done("과거 시각으로 변경하면 서버가 거절");

  await op.getByRole("button", { name: "지금 마감" }).click();
  await until("마감", async () => (await db.select().from(polls).where(eq(polls.id, pollId)))[0].status === "closed");
  await gp.reload();
  await gp.getByText("투표가 마감됐어요").waitFor();
  assert.equal(await gp.getByRole("button", { name: /제출/ }).count(), 0);
  done("지금 마감 → 참여자 화면 읽기 전용");

  await op.getByRole("button", { name: "다시 열기" }).click();
  await until("재개", async () => (await db.select().from(polls).where(eq(polls.id, pollId)))[0].status === "open");
  await gp.reload();
  await gp.getByRole("button", { name: /제출/ }).waitFor();
  done("다시 열기 → 참여자 화면에서 다시 제출 가능");

  // 마감 시각이 지난 투표를 다시 열려면 시각을 먼저 바꿔야 한다.
  await db.update(polls).set({ respondBy: new Date(Date.now() - 60_000), status: "closed" }).where(eq(polls.id, pollId));
  await op.reload();
  await op.getByRole("button", { name: "다시 열기" }).click();
  await op.getByRole("alert").getByText(/마감 시각이 이미 지났어요/).waitFor();
  await op.getByRole("button", { name: "+1일 연장" }).click();
  await until("지난 마감 연장 → 자동 재개", async () => {
    const [row] = await db.select().from(polls).where(eq(polls.id, pollId));
    return row.status === "open" && row.respondBy && row.respondBy.getTime() > Date.now() ? row : false;
  });
  done("지난 마감: 다시 열기는 거절, 연장하면 자동으로 다시 열림");

  /* 4. 확정 */
  await op.reload();
  const heat = op.getByRole("button", { name: /명 중 \d+명 안 됨/ });
  await heat.nth(3).click();
  await op.getByRole("button", { name: "이 날짜로 확정" }).click();
  await op.getByText(/\d+월 \d+일 \(.\) 확정$/).waitFor();
  await gp.reload();
  await gp.getByText("확정된 날짜").waitFor();
  done("날짜 확정 → 참여자 화면에 확정 날짜 표시");
  assert.equal(await op.getByRole("button", { name: "+1일 연장" }).isDisabled(), true);
  done("확정 중에는 마감 관리 잠김");
  await op.getByRole("button", { name: "확정 취소" }).click();
  await until("확정 취소", async () => (await db.select().from(polls).where(eq(polls.id, pollId)))[0].status === "open");
  done("확정 취소");

  /* 5. 응답 삭제 · 링크 재발급 · 삭제 */
  await op.reload();
  await op.getByRole("button", { name: "게스트B 응답 삭제" }).click();
  await op.getByText("응답한 사람 1명").waitFor();
  done("참여자 응답 삭제");

  await op.getByRole("button", { name: "새 링크 만들기" }).first().click();
  await until("링크 재발급", async () => {
    const value = await op.getByLabel("공유 링크").inputValue();
    return !value.includes(token) ? value : false;
  });
  await gp.goto(`${base}/v/${token}`);
  await gp.getByText("링크를 열 수 없습니다").waitFor();
  done("링크 재발급 → 이전 링크는 '열 수 없는 링크'");

  await op.getByRole("button", { name: "투표 삭제" }).click();
  await op.waitForURL(/\/polls$/);
  const [gone] = await db.select().from(polls).where(eq(polls.id, pollId));
  assert.equal(gone, undefined);
  done("투표 삭제");

  assert.deepEqual(problems.filter((p) => !/favicon|Failed to load resource/.test(p)), [], "브라우저 콘솔 오류가 없어야 한다");
  done("브라우저 콘솔·페이지 오류 없음");
  console.log(`(확인창 ${dialogs.length}개 수락)`);
} finally {
  await browser.close();
  await cleanup();
  const [left] = await sql`select count(*)::int as n from users where email like ${PREFIX + "%"}`;
  console.log(`정리 완료 (남은 임시 계정 ${left.n}개)`);
  await sql.end({ timeout: 5 });
}
