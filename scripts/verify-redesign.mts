import "./load-env.mjs";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { eq, inArray } from "drizzle-orm";
import { db, sql } from "../src/lib/db";
import { users, sessions, spaces, spaceMembers, notes, tasks, projectMessages } from "../src/lib/db/schema";
import { hashSessionToken } from "../src/lib/token-store";

// 실제 라우트에서 임시 데이터만 사용하고 정리한다. 앱의 권한·서버 액션은 그대로 거친다.
import { chromium, expect, type Browser } from "@playwright/test";
const base = process.env.REDESIGN_TEST_URL || "http://127.0.0.1:3292";
const userId = randomUUID();
const spaceIds = Array.from({ length: 6 }, () => randomUUID());
const noteIds = spaceIds.map(() => randomUUID());
const output = ".verify-shots/redesign";
let browser: Browser | undefined;
try {
  await mkdir(output, { recursive: true });
  await db.insert(users).values({ id: userId, name: "디자인 검증", email: `redesign-${userId}@example.invalid` });
  await db.insert(spaces).values(spaceIds.map((id, i) => ({ id, ownerId: userId, name: ["프로덕트 디자인", "프론트엔드 스터디", "다음 분기 계획", "서비스 운영 인수인계", "모바일 경험 개선", "긴 프로젝트 이름도 작은 화면에서 겹치지 않고 읽을 수 있는지 확인합니다"][i] })));
  await db.insert(spaceMembers).values(spaceIds.map(spaceId => ({ spaceId, userId, role: "owner" as const })));
  await db.insert(notes).values(noteIds.map((id, i) => ({ id, spaceId: spaceIds[i], title: ["새로운 작업 공간의 방향", "이번 주 함께 정리한 내용", "다음 회의에서 나눌 이야기", "운영 체크리스트", "모바일 화면 점검", "긴 제목을 가진 기록의 레이아웃 확인"][i], createdBy: userId, content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "함께 확인한 내용을 기록합니다." }] }] } })));
  await db.insert(tasks).values([{ noteId: noteIds[0], spaceId: spaceIds[0], assigneeId: userId, body: "다음 회의 전에 사용자 피드백 정리하기", dueDate: "2026-01-01" }]);
  await db.insert(projectMessages).values(Array.from({ length: 30 }, (_, i) => ({ id: randomUUID(), spaceId: spaceIds[0], createdBy: userId, body: `화면 검증 메시지 ${i + 1}. ${i === 10 ? "LongUnbrokenText".repeat(25) : "좋은 아이디어를 함께 기록하고 다음 작업으로 이어갑니다."}`, createdAt: new Date(Date.now() - (30 - i) * 60000) })));
  const token = randomBytes(32).toString("hex");
  await db.insert(sessions).values({ sessionToken: hashSessionToken(token), userId, expires: new Date(Date.now() + 3600000) });
  browser = await chromium.launch({ headless: true, channel: "msedge" });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addCookies([{ name: "authjs.session-token", value: token, url: base, httpOnly: true, sameSite: "Lax" }]);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error: Error) => errors.push(error.message));
  page.setDefaultTimeout(20000);
  async function noOverflow(label: string) {
    const metrics = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
    assert.ok(metrics.scroll <= metrics.width + 1, `${label}: 가로 넘침 ${JSON.stringify(metrics)}`);
  }
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(base, { waitUntil: "networkidle", timeout: 90000 });
    await expect(page.getByRole("heading", { name: "내 프로젝트", exact: true })).toBeVisible();
    await noOverflow(`홈 ${width}`);
    await page.screenshot({ path: `${output}/home-${width}.png`, fullPage: true });
    await page.evaluate(() => { const tabs = document.querySelector('.folder-tabs')!; window.scrollTo(0, window.scrollY + tabs.getBoundingClientRect().top - 80); });
    const bounds = await page.evaluate(() => ({ header: document.querySelector('.app-topbar')!.getBoundingClientRect().bottom, tabs: document.querySelector('.folder-tabs')!.getBoundingClientRect().top }));
    assert.ok(bounds.tabs >= bounds.header - 1, `홈 폴더 탭 겹침 ${width}`);
    await page.goto(`${base}/s/${spaceIds[0]}`, { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "프로덕트 디자인", exact: true })).toBeVisible();
    await noOverflow(`대화 ${width}`);
    assert.ok(await page.evaluate(() => window.scrollY < 5), `대화 진입 시 문서 스크롤 이동 ${width}`);
    const log = page.getByRole("list", { name: "프로젝트 메시지" });
    await expect(log).toBeVisible();
    await log.evaluate((el: HTMLElement) => { el.scrollTop = 0; });
    assert.equal(await log.evaluate((el: HTMLElement) => el.scrollTop), 0);
    await page.screenshot({ path: `${output}/chat-${width}.png`, fullPage: true });
    await page.goto(`${base}/calendar`, { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "내 일정", exact: true })).toBeVisible();
    await noOverflow(`일정 ${width}`);
    await page.getByRole("button", { name: "일정 추가", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const boundsDialog = await dialog.boundingBox();
    assert.ok(boundsDialog && boundsDialog.x >= 0 && boundsDialog.x + boundsDialog.width <= width + 1, `일정 모달 넘침 ${width}`);
    await page.screenshot({ path: `${output}/dialog-${width}.png` });
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    if (width < 768) {
      await page.getByRole("button", { name: "나", exact: true }).click();
      await expect(page.getByRole("dialog", { name: "내 계정" })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog", { name: "내 계정" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "나", exact: true })).toBeFocused();
    }
    console.log(`PASS ${width}px: 홈·채팅·일정·모달, 가로 넘침, 상단 위치, 대화 첫 메시지 접근`);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto(base, { waitUntil: "networkidle" });
  await noOverflow("다크 모드");
  await page.screenshot({ path: `${output}/home-dark.png`, fullPage: true });
  for (const route of ["/search", "/spaces/new", "/tasks", `/s/${spaceIds[0]}?tab=notes`, `/s/${spaceIds[0]}?tab=members`]) {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto(base + route, { waitUntil: "networkidle" });
    await noOverflow(route);
  }
  assert.deepEqual(errors, []);
  console.log("PASS 다크 모드·검색·새 프로젝트·할 일·노트 목록·멤버 화면, 브라우저 오류 없음");
} finally {
  await browser?.close();
  await db.delete(spaces).where(inArray(spaces.id, spaceIds));
  await db.delete(users).where(eq(users.id, userId));
  await sql.end();
  console.log("임시 검증 데이터 정리 완료");
}
