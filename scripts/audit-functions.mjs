/** 운영 기능 점검. 새로 만든 임시 계정·스페이스만 사용하고 결과에는 토큰을 남기지 않는다. */
import "./load-env.mjs";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { and, eq, inArray } from "drizzle-orm";
import { db, sql } from "../src/lib/db/index.ts";
import { users, sessions, spaces, spaceMembers, notes, noteDocs, tasks } from "../src/lib/db/schema.ts";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? "../../trip/node_modules/@playwright/test");
const base = process.env.AUDIT_URL ?? "https://meeting-minutes-orcin.vercel.app";
const ids = [randomUUID(), randomUUID(), randomUUID()];
const spaceId = randomUUID(), otherSpace = randomUUID(), noteId = randomUUID(), privateNote = randomUUID(), taskId = randomUUID();
const tokens = ids.map(() => randomBytes(32).toString("hex"));
const results = { base, date: new Date().toISOString(), routes: [], checks: [], errors: [], cleanup: false };
const textDoc = (text) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
let browser;
async function check(name, fn) {
  const start = performance.now();
  try { const detail = await fn(); results.checks.push({ name, ok: true, ms: Math.round(performance.now() - start), detail }); console.log("PASS", name, detail ?? ""); }
  catch (error) { const message = error.message.split("Call log:")[0].slice(0, 350); results.checks.push({ name, ok: false, ms: Math.round(performance.now() - start), message }); console.log("FAIL", name, message); }
}
async function contextFor(index) {
  const context = await browser.newContext();
  if (index !== undefined) await context.addCookies([{ name: "__Secure-authjs.session-token", value: tokens[index], url: base, secure: true, httpOnly: true, sameSite: "Lax" }]);
  return context;
}
async function open(page, path, selector) {
  const start = performance.now();
  const response = await page.goto(base + path, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.locator(selector).first().waitFor({ timeout: 20000 });
  return { ms: Math.round(performance.now() - start), status: response.status(), region: (response.headers()["x-vercel-id"] ?? "").split("::").slice(0, 2).join("::") };
}
try {
  await db.insert(users).values(ids.map((id, i) => ({ id, name: `기능점검 ${i}`, email: `audit-${id}@example.invalid` })));
  await db.insert(sessions).values(ids.map((userId, i) => ({ userId, sessionToken: tokens[i], expires: new Date(Date.now() + 3600000) })));
  await db.insert(spaces).values([{ id: spaceId, name: "점검 스페이스", ownerId: ids[0] }, { id: otherSpace, name: "점검 외부 비공개", ownerId: ids[2] }]);
  await db.insert(spaceMembers).values([{ spaceId, userId: ids[0], role: "owner" }, { spaceId: otherSpace, userId: ids[2], role: "owner" }]);
  const content = { type: "doc", content: [...textDoc("점검 본문").content, { type: "taskList", content: [{ type: "taskItem", attrs: { blockId: "audit-task", checked: false }, content: [{ type: "paragraph", content: [{ type: "text", text: "점검 담당 할 일" }] }] }] }] };
  await db.insert(notes).values([
    { id: noteId, spaceId, title: "점검 일반 노트", createdBy: ids[0], content, plainText: "점검 본문 점검 담당 할 일" },
    { spaceId, title: "점검 50% 기준", createdBy: ids[0], content: textDoc("비율 50%"), plainText: "비율 50%" },
    { spaceId, title: "점검 50점 기준", createdBy: ids[0], content: textDoc("점수 50점"), plainText: "점수 50점" },
    { id: privateNote, spaceId: otherSpace, title: "외부비공개표식", createdBy: ids[2], content: textDoc("외부비공개본문"), plainText: "외부비공개본문" },
  ]);
  await db.insert(noteDocs).values({ noteId });
  await db.insert(tasks).values({ id: taskId, spaceId, noteId, body: "점검 담당 할 일", assigneeId: ids[0], blockId: "audit-task" });
  browser = await chromium.launch({ headless: true, channel: "msedge" });
  const owner = await contextFor(0), member = await contextFor(1), anon = await contextFor();
  const page = await owner.newPage(), visitor = await anon.newPage(), joiner = await member.newPage();
  page.on("pageerror", (error) => results.errors.push(error.message.slice(0, 150)));
  page.on("dialog", (dialog) => dialog.accept());
  const routes = [["홈", "/", "main"], ["스페이스 노트", `/s/${spaceId}`, 'nav[aria-label="스페이스 메뉴"]'], ["스페이스 할 일", `/s/${spaceId}?tab=tasks`, 'nav[aria-label="스페이스 메뉴"]'], ["멤버", `/s/${spaceId}?tab=members`, 'section[aria-label="멤버 목록"]'], ["내 할 일", "/tasks", 'nav[aria-label="할 일 상태"]'], ["검색", "/search?q=" + encodeURIComponent("점검"), 'section[aria-label="검색 결과"]'], ["새 노트", `/s/${spaceId}/new`, "#note-title"], ["새 스페이스", "/spaces/new", "#space-name"]];
  for (let round = 1; round <= 3; round++) {
    for (const [name, path, selector] of routes) {
      try { const r = { name, round, ...await open(page, path, selector) }; results.routes.push(r); console.log("ROUTE", name, round, r.ms); }
      catch (e) { results.routes.push({ name, round, error: e.message.split("Call log:")[0].slice(0, 120) }); }
    }
  }
  await check("비로그인 보호 화면 접근", async () => {
    for (const path of ["/", "/tasks", "/search", `/s/${spaceId}`]) { const r = await anon.request.get(base + path, { maxRedirects: 0 }); assert.equal(r.status(), 307); assert.ok(r.headers().location.includes("/login")); }
  });
  await check("다른 스페이스 노트·검색 차단", async () => {
    await page.goto(`${base}/s/${otherSpace}/n/${privateNote}`); assert.ok(!(await page.locator("body").innerText()).includes("외부비공개표식"));
    await page.goto(`${base}/search?q=${encodeURIComponent("외부비공개")}`); assert.equal(await page.locator('section[aria-label="검색 결과"] a').count(), 0);
  });
  await check("검색 % 문자 정확성", async () => {
    await page.goto(`${base}/search?q=${encodeURIComponent("50%")}`);
    const titles = await page.locator('section[aria-label="검색 결과"] h2').allTextContents();
    assert.deepEqual(titles, ["점검 50% 기준"]);
  });
  await check("초대 발급·가입·회수", async () => {
    await page.goto(`${base}/s/${spaceId}?tab=members`);
    await page.getByRole("button", { name: "초대 링크 만들기", exact: true }).click();
    const field = page.locator('input[readonly]'); await field.waitFor(); const inviteUrl = await field.inputValue();
    await joiner.goto(inviteUrl); await joiner.getByRole("button", { name: "스페이스 참여하기" }).click(); await joiner.waitForURL(`${base}/s/${spaceId}`);
    assert.equal((await db.select().from(spaceMembers).where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, ids[1])))).length, 1);
    await page.getByRole("button", { name: "링크 회수", exact: true }).click(); await page.getByText("회수됨", { exact: true }).waitFor();
    await visitor.goto(inviteUrl); assert.ok(!(await visitor.locator("body").innerText()).includes("점검 스페이스"));
  });
  await check("스페이스 생성", async () => {
    await page.goto(base + "/spaces/new"); await page.locator("#space-name").fill("점검 생성 스페이스");
    await page.getByRole("button", { name: "스페이스 만들기" }).click(); await page.waitForURL(/\/s\/[a-f0-9-]+$/);
    assert.ok((await page.locator("main").innerText()).includes("점검 생성 스페이스"));
  });
  for (const [kind, heading] of [["study", "배운 것"], ["handover", "접근 권한"], ["blank", null]]) await check(`템플릿 생성 ${kind}`, async () => {
    await page.goto(`${base}/s/${spaceId}/new`); await page.locator(`input[value="${kind}"]`).check(); await page.locator("#note-title").fill(`점검 템플릿 ${kind}`);
    await page.getByRole("button", { name: "노트 만들기" }).click(); await page.waitForURL(/\/n\/[a-f0-9-]+$/);
    const editor = page.locator('.tiptap[contenteditable="true"]'); await editor.waitFor({ timeout: 30000 });
    if (heading) assert.ok((await editor.innerText()).includes(heading));
  });
  const notePath = `${base}/s/${spaceId}/n/${noteId}`;
  await check("노트 열기·제목·상태 변경", async () => {
    await page.goto(notePath); await page.locator('.tiptap[contenteditable="true"]').waitFor({ timeout: 30000 });
    await page.getByTitle("클릭해서 제목 수정").click(); await page.getByLabel("노트 제목", { exact: true }).fill("점검 수정 제목"); await page.getByLabel("노트 제목", { exact: true }).press("Enter");
    await page.getByTitle("상태 바꾸기").click(); await page.waitForTimeout(2000);
    const [row] = await db.select().from(notes).where(eq(notes.id, noteId)); assert.equal(row.title, "점검 수정 제목"); assert.equal(row.status, "tidied");
  });
  await check("공유 링크 생성·공개 열람·회수", async () => {
    await page.goto(notePath); await page.getByRole("button", { name: "공유", exact: true }).click();
    await page.getByRole("button", { name: "링크 만들고 복사" }).click(); const code = page.locator("aside code"); await code.waitFor(); const url = await code.innerText();
    await visitor.goto(url); assert.ok((await visitor.locator("body").innerText()).includes("점검 본문")); assert.equal(await visitor.locator('[contenteditable="true"]').count(), 0);
    await page.getByRole("button", { name: "회수", exact: true }).click(); await page.getByText("회수됨", { exact: true }).waitFor();
    await visitor.reload(); assert.ok(!(await visitor.locator("body").innerText()).includes("점검 본문"));
  });
  await check("내 할 일 완료가 열린 편집기에 반영", async () => {
    await page.goto(notePath); const editor = page.locator('.tiptap[contenteditable="true"]'); await editor.waitFor({ timeout: 30000 });
    const taskPage = await owner.newPage(); await taskPage.goto(base + "/tasks"); await taskPage.getByRole("checkbox", { name: "점검 담당 할 일 완료", exact: true }).check();
    await taskPage.waitForTimeout(2000); const [row] = await db.select().from(tasks).where(eq(tasks.id, taskId)); assert.ok(row.doneAt);
    const before = await editor.locator('input[type="checkbox"]').first().isChecked();
    await editor.click(); await page.keyboard.press("Control+End"); await page.keyboard.insertText(" 추가 입력"); await page.waitForTimeout(2500);
    const [after] = await db.select().from(tasks).where(eq(tasks.id, taskId));
    await taskPage.close(); assert.ok(before && after.doneAt, `본문 완료=${before}, 후속 편집 뒤 DB 완료=${Boolean(after.doneAt)}`);
  });
  await check("입력 직후 나가기 후 검색용 본문 저장", async () => {
    await page.goto(notePath); const editor = page.locator('.tiptap[contenteditable="true"]'); await editor.waitFor({ timeout: 30000 });
    await editor.click(); await page.keyboard.press("Control+Home"); await page.keyboard.insertText("즉시이동검증표식 ");
    await page.goto(base + "/tasks"); await page.waitForTimeout(4000);
    const [row] = await db.select().from(notes).where(eq(notes.id, noteId)); assert.ok(row.plainText.includes("즉시이동검증표식"), "검색·공유 사본에 마지막 입력이 없음");
  });
  await check("변경 이력 목록·미리보기", async () => {
    await page.goto(notePath); await page.getByRole("button", { name: "이력", exact: true }).click(); await page.getByRole("button", { name: "이 시점으로 되돌리기" }).waitFor({ timeout: 25000 });
  });
  await check("모바일 가로 넘침", async () => {
    await page.setViewportSize({ width: 390, height: 844 }); await page.goto(`${base}/s/${spaceId}?tab=members`);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  });
} finally {
  await browser?.close();
  await new Promise((resolve) => setTimeout(resolve, 35000));
  try {
    await db.delete(spaces).where(inArray(spaces.ownerId, ids));
    await db.delete(users).where(inArray(users.id, ids));
    results.cleanup = true;
  } finally {
    writeFileSync(".audit-runtime.json", JSON.stringify(results, null, 2) + "\n");
    await sql.end();
  }
}