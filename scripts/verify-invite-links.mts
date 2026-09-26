/** 임시 스페이스에서 실제 초대 생성 폼을 제출하고 생성한 데이터만 정리한다. */
import "./load-env.mjs";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { db, sql } from "../src/lib/db/index.js";
import { users, sessions, spaces, spaceMembers, inviteLinks } from "../src/lib/db/schema.js";

const base = process.env.INVITE_TEST_URL ?? "http://127.0.0.1:3100";
const ownerId = randomUUID();
const memberId = randomUUID();
const spaceId = randomUUID();
const ownerToken = randomBytes(32).toString("hex");
const memberToken = randomBytes(32).toString("hex");
const memberPath = `/s/${spaceId}?tab=members`;
const decode = (value: string) => value.replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

async function request(path: string, token = ownerToken, init: RequestInit = {}) {
  return fetch(`${base}${path}`, {
    ...init, redirect: "manual", signal: AbortSignal.timeout(30000),
    headers: { Origin: base, ...(token ? { Cookie: `__Secure-authjs.session-token=${token}` } : {}), ...init.headers },
  });
}

function formData(html: string, label: string) {
  const form = [...html.matchAll(/<form\b[^>]*>([\s\S]*?)<\/form>/g)].find((match) => match[1].includes(label))?.[1];
  assert.ok(form, `${label} 폼이 있어야 한다`);
  const data = new FormData();
  for (const input of form.matchAll(/<input\b[^>]*>/g)) {
    const name = input[0].match(/name="([^"]+)"/)?.[1];
    const value = input[0].match(/value="([^"]*)"/)?.[1] ?? "";
    if (name) data.append(decode(name), decode(value));
  }
  assert.ok([...data.keys()].some((key) => key.startsWith("$ACTION_")));
  return data;
}

try {
  await db.insert(users).values([
    { id: ownerId, name: "초대 검증 소유자", email: `invite-owner-${ownerId}@example.invalid` },
    { id: memberId, name: "초대 검증 멤버", email: `invite-member-${memberId}@example.invalid` },
  ]);
  await db.insert(spaces).values({ id: spaceId, name: "초대 링크 검증용", ownerId });
  await db.insert(spaceMembers).values([
    { spaceId, userId: ownerId, role: "owner" }, { spaceId, userId: memberId, role: "member" },
  ]);
  await db.insert(sessions).values([
    { sessionToken: ownerToken, userId: ownerId, expires: new Date(Date.now() + 600000) },
    { sessionToken: memberToken, userId: memberId, expires: new Date(Date.now() + 600000) },
  ]);
  const page = await request(memberPath);
  assert.equal(page.status, 200);
  const html = await page.text();
  const createData = formData(html, "초대 링크 만들기");
  createData.set("expiry", "7");
  const memberPage = await (await request(memberPath, memberToken)).text();
  assert.ok(!memberPage.includes("초대 링크 만들기"));
  const denied = await request(memberPath, memberToken, { method: "POST", body: createData });
  await denied.text();
  assert.equal((await db.select().from(inviteLinks).where(eq(inviteLinks.spaceId, spaceId))).length, 0);
  console.log("PASS 일반 멤버 초대 생성 차단");

  const response = await request(memberPath, ownerToken, { method: "POST", body: createData });
  await response.text();
  const [invite] = await db.select().from(inviteLinks).where(eq(inviteLinks.spaceId, spaceId));
  console.log(`초대 생성 응답: HTTP ${response.status}, DB 생성: ${Boolean(invite)}`);
  assert.ok(invite, "초대 링크가 DB에 생성되어야 한다");
  const refreshed = await (await request(memberPath)).text();
  assert.ok(refreshed.includes(`${base}/join/${invite.token}`), "생성 후 멤버 화면에 현재 배포 주소의 초대 링크가 표시되어야 한다");
  assert.equal(invite.createdBy, ownerId);
  assert.ok(invite.expiresAt && invite.expiresAt.getTime() > Date.now() + 6 * 86400000);
  const preview = await request(`/join/${invite.token}`, "");
  assert.equal(preview.status, 200);
  assert.ok((await preview.text()).includes("초대 링크 검증용"));
  console.log("PASS 소유자 초대 생성·목록·7일 만료·비로그인 미리보기");
} finally {
  await db.delete(spaces).where(eq(spaces.id, spaceId));
  await db.delete(users).where(inArray(users.id, [ownerId, memberId]));
  await sql.end();
}
