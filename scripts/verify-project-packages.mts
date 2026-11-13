import './load-env.mjs';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { eq } from 'drizzle-orm';
import { db, sql } from '../src/lib/db/index.js';
import { users, spaces, spaceMembers, sessions, projectFiles } from '../src/lib/db/schema.js';
import { hashSessionToken } from '../src/lib/token-store.js';
import { removeAttachmentFile } from '../src/lib/attachment-storage.js';
import { chromium, expect as baseExpect, type Browser } from "@playwright/test";
const expect = baseExpect.configure({ timeout: 30000 });
const base = 'http://127.0.0.1:3291';
const userId = randomUUID(), spaceId = randomUUID(), token = randomBytes(32).toString('hex');
const output = 'logs/project-packages';
const results: string[] = [];
let browser: Browser | undefined;
function pass(message: string) { results.push('PASS ' + message); console.log(results.at(-1)); }
function archive() {
  const name = Buffer.from('AndroidManifest.xml');
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50); central.writeUInt16LE(name.length, 28);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(46 + name.length, 12); end.writeUInt32LE(30 + name.length, 16);
  return Buffer.concat([local, name, central, name, end]);
}
try {
  await mkdir(output, { recursive: true });
  await db.insert(users).values({ id: userId, name: '패키지 UI 검증', email: `package-ui-${userId}@example.invalid` });
  await db.insert(sessions).values({ userId, sessionToken: hashSessionToken(token), expires: new Date(Date.now() + 900000) });
  await db.insert(spaces).values({ id: spaceId, name: '패키지 UI 검증 전용', ownerId: userId });
  await db.insert(spaceMembers).values({ spaceId, userId, role: 'owner' });
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  await context.addCookies([{ name: 'authjs.session-token', value: token, url: base, httpOnly: true, sameSite: 'Lax' }]);
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  await page.goto(`${base}/s/${spaceId}/files`, { timeout: 120000 });
  const file = page.locator('input[name=file]'), version = page.locator('input[name=version]'), description = page.locator('textarea[name=description]');
  const bytes = archive();
  for (const extension of ['zip', 'apk']) {
    const name = `검증.${extension}`;
    await file.setInputFiles({ name, mimeType: 'application/zip', buffer: bytes });
    await version.fill('1.2.3'); await description.fill('실제 브라우저 업로드');
    const response = page.waitForResponse((r) => r.url().endsWith(`/api/spaces/${spaceId}/files`) && r.request().method() === 'POST');
    await page.getByRole('button', { name: '파일 올리기', exact: true }).click();
    assert.equal((await response).status(), 201);
    const row = page.locator('li').filter({ has: page.getByRole('heading', { name, exact: true }) });
    await expect(row).toBeVisible();
    const downloading = page.waitForEvent('download');
    await row.getByRole('link', { name: '다운로드', exact: true }).click();
    const download = await downloading;
    assert.equal(download.suggestedFilename(), name);
    assert.deepEqual(await readFile(await download.path()), bytes);
    pass(`${extension.toUpperCase()} 업로드 → 목록 표시 → 다운로드 파일명·바이트 일치`);
  }
  await file.setInputFiles({ name: 'broken.apk', mimeType: 'application/zip', buffer: Buffer.from('invalid archive') });
  await version.fill('실패 후 보존'); await description.fill('다시 선택할 때 유지할 설명');
  const failed = page.waitForResponse((r) => r.url().endsWith(`/api/spaces/${spaceId}/files`) && r.request().method() === 'POST');
  await page.getByRole('button', { name: '파일 올리기', exact: true }).click();
  assert.equal((await failed).status(), 400);
  await expect(version).toHaveValue('실패 후 보존'); await expect(description).toHaveValue('다시 선택할 때 유지할 설명');
  assert.equal(await file.evaluate((el: HTMLInputElement) => el.files?.[0]?.name), 'broken.apk');
  pass('손상 APK 실패 후 파일·버전·설명 유지');
  await db.insert(projectFiles).values(Array.from({ length: 99 }, (_, i) => ({ id: randomUUID(), spaceId, kind: 'package' as const, name: `페이지검증-${i}.zip`, mime: 'application/zip', size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), uploadedBy: userId, createdAt: new Date(Date.now() + i) })));
  await page.reload();
  await expect(page.locator('main li')).toHaveCount(100);
  await version.fill('페이지 이동 초안'); await description.fill('초안 설명');
  await file.setInputFiles({ name: 'draft.zip', mimeType: 'application/zip', buffer: bytes });
  await page.getByRole('link', { name: '다음', exact: true }).click();
  await expect(page.locator('main li')).toHaveCount(1);
  await expect(page.getByRole('link', { name: '다음', exact: true })).toHaveCount(0);
  await expect(version).toHaveValue('페이지 이동 초안'); await expect(description).toHaveValue('초안 설명');
  assert.equal(await file.evaluate((el: HTMLInputElement) => el.files?.[0]?.name), 'draft.zip');
  await page.getByRole('link', { name: '이전', exact: true }).click();
  await expect(page.locator('main li')).toHaveCount(100); await expect(version).toHaveValue('페이지 이동 초안');
  pass('101개 항목 100/1 페이지 이동 및 파일·버전·설명 초안 유지');
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await page.screenshot({ path: `${output}/mobile.png`, fullPage: false });
  pass('390px 모바일 가로 넘침 없음');
} catch (error) {
  results.push('FAIL ' + String(error)); throw error;
} finally {
  await browser?.close();
  const files = await db.select({ id: projectFiles.id }).from(projectFiles).where(eq(projectFiles.spaceId, spaceId));
  for (const file of files) await removeAttachmentFile(file.id).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; });
  await db.delete(spaces).where(eq(spaces.id, spaceId));
  await db.delete(users).where(eq(users.id, userId));
  await sql.end({ timeout: 5 });
  await writeFile(`${output}/result.log`, `${new Date().toISOString()}\n${results.join('\n')}\n`, 'utf8');
}
