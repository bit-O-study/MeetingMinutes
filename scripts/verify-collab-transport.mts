import "./load-env.mjs";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { chromium, type Browser } from "@playwright/test";
import WebSocket from "ws";
import { eq, inArray } from "drizzle-orm";
import { db, sql } from "../src/lib/db/index.js";
import { users, spaces, spaceMembers, sessions, notes, noteDocs } from "../src/lib/db/schema.js";

const base = process.env.EDITOR_TEST_URL ?? "http://127.0.0.1:3298";
const secure = base.startsWith("https:") || process.env.EDITOR_TEST_PRODUCTION === "1";
const cookieName = secure ? "__Secure-authjs.session-token" : "authjs.session-token";
const ids = [randomUUID(), randomUUID(), randomUUID()], spaceId = randomUUID(), noteId = randomUUID();
const tokens = ids.map(() => randomBytes(32).toString("hex"));
let browser: Browser | undefined;
async function rejected(token: string | null, origin: string, expected: number, target = noteId) {
  const url = new URL(`/api/collab/${target}`, base); url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  await new Promise<void>((resolve, reject) => {
    const socket = new WebSocket(url, { origin, headers: token ? { Cookie: `${cookieName}=${token}` } : {}, handshakeTimeout: 10000 });
    socket.on("open", () => { socket.close(); reject(new Error("Unauthorized socket opened")); });
    socket.on("unexpected-response", (_request, response) => {
      response.resume(); socket.terminate();
      try { assert.equal(response.statusCode, expected); resolve(); } catch (error) { reject(error); }
    });
    socket.on("error", reject);
  });
}
try {
  await db.insert(users).values(ids.map((id, i) => ({ id, name: `연결 검증 ${i}`, email: `transport-${id}@example.invalid` })));
  await db.insert(spaces).values({ id: spaceId, name: "편집 연결 검증", ownerId: ids[0] });
  await db.insert(spaceMembers).values(ids.slice(0, 2).map((userId) => ({ spaceId, userId, role: "member" as const })));
  await db.insert(sessions).values(ids.map((userId, i) => ({ userId, sessionToken: tokens[i], expires: new Date(Date.now() + 900000) })));
  await db.insert(notes).values({ id: noteId, spaceId, title: "연결 검증", createdBy: ids[0], template: "blank", content: { type: "doc", content: [{ type: "paragraph" }] } });
  await db.insert(noteDocs).values({ noteId });
  await rejected(null, base, 401);
  await rejected(tokens[2], base, 404);
  await rejected(tokens[0], base, 404, randomUUID());
  await rejected(tokens[0], "https://example.invalid", 403);
  console.log("PASS 미인증·비멤버·없는 노트·외부 Origin 소켓 차단");
  browser = await chromium.launch({ channel: "msedge", headless: true });
  const contexts = await Promise.all(ids.slice(0, 2).map(() => browser!.newContext()));
  await Promise.all(contexts.map((context, i) => context.addCookies([{ name: cookieName, value: tokens[i], domain: new URL(base).hostname, path: "/", secure, httpOnly: true, sameSite: "Lax" }])));
  const pages = await Promise.all(contexts.map((context) => context.newPage()));
  pages.forEach((page) => page.setDefaultTimeout(20000));
  const url = `${base}/s/${spaceId}/n/${noteId}`;
  await Promise.all(pages.map((page) => page.goto(url)));
  const editors = pages.map((page) => page.locator('.tiptap[contenteditable="true"]'));
  await Promise.all(editors.map((editor) => editor.waitFor({ timeout: 30000 })));
  await editors[0].click(); await pages[0].keyboard.insertText("공동 편집 저장 검증");
  await editors[1].locator("p").filter({ hasText: "공동 편집 저장 검증" }).waitFor();
  await pages[0].getByText(/연결됨 · .* 반영/).waitFor({ timeout: 20000 });
  const [saved] = await db.select().from(notes).where(eq(notes.id, noteId));
  assert.match(JSON.stringify(saved.content), /공동 편집 저장 검증/);
  await pages[1].reload(); await editors[1].locator("p").filter({ hasText: "공동 편집 저장 검증" }).waitFor();
  console.log("PASS 편집 준비·두 사용자 동기화·DB 저장·새로고침 보존");
  await contexts[0].setOffline(true);
  await editors[0].click(); await pages[0].keyboard.press("Control+End"); await pages[0].keyboard.insertText(" 재접속 보존");
  await contexts[0].setOffline(false);
  await editors[1].locator("p").filter({ hasText: "공동 편집 저장 검증 재접속 보존" }).waitFor({ timeout: 30000 });
  await pages[0].getByText(/연결됨 · .* 반영/).waitFor({ timeout: 20000 });
  console.log("PASS 오프라인 입력 재접속 및 저장 확인");
} finally {
  await browser?.close();
  // 방의 마지막 저장과 테스트 행 삭제가 경합하지 않게 한다.
  await new Promise((resolve) => setTimeout(resolve, 35000));
  await db.delete(spaces).where(eq(spaces.id, spaceId));
  await db.delete(users).where(inArray(users.id, ids));
  await sql.end({ timeout: 5 });
}
