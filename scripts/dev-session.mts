/**
 * 개발용 세션 발급 (검증·수동 테스트용)
 *
 *   npm run dev:session 테스터
 *
 * devSignIn 서버 액션과 같은 일을 한다: 사용자·세션 행을 만들고
 * 개발용 공유 스페이스에 넣는다. 출력된 쿠키를 브라우저에 심으면 로그인된다.
 */
import "./load-env.mjs";

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";

import { db, sql } from "../src/lib/db";
import { noteDocs, notes, sessions, spaceMembers, spaces, users } from "../src/lib/db/schema";
import { buildTemplateDoc, docToPlainText } from "../src/lib/templates";

const DEV_SPACE_ID = "00000000-0000-4000-8000-000000000001";
const name = process.argv[2] ?? "테스터";
const email = `${encodeURIComponent(name.toLowerCase())}@dev.local`;

const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
const user =
  existing ??
  (await db.insert(users).values({ name, email, emailVerified: new Date() }).returning())[0];

const sessionToken = randomUUID() + randomUUID().replace(/-/g, "");
const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
await db.insert(sessions).values({ sessionToken, userId: user.id, expires });

const [space] = await db.select().from(spaces).where(eq(spaces.id, DEV_SPACE_ID)).limit(1);
if (!space) {
  await db
    .insert(spaces)
    .values({ id: DEV_SPACE_ID, name: "개발 스터디 (샘플)", kind: "study", ownerId: user.id })
    .onConflictDoNothing();
}

const [member] = await db
  .select({ userId: spaceMembers.userId })
  .from(spaceMembers)
  .where(and(eq(spaceMembers.spaceId, DEV_SPACE_ID), eq(spaceMembers.userId, user.id)))
  .limit(1);

if (!member) {
  await db
    .insert(spaceMembers)
    .values({ spaceId: DEV_SPACE_ID, userId: user.id, role: space ? "member" : "owner" })
    .onConflictDoNothing();
}

const seeded = await db
  .select({ id: notes.id })
  .from(notes)
  .where(eq(notes.spaceId, DEV_SPACE_ID))
  .limit(1);

if (seeded.length === 0) {
  for (const [template, title, no] of [
    ["study", "1회차", 1],
    ["handover", "결제 배치 인수인계", null],
  ] as const) {
    const content = buildTemplateDoc(template, no ?? 1);
    const [note] = await db
      .insert(notes)
      .values({
        spaceId: DEV_SPACE_ID,
        title,
        template,
        content,
        plainText: docToPlainText(content),
        sessionNo: no,
        createdBy: user.id,
        updatedBy: user.id,
      })
      .returning();
    await db.insert(noteDocs).values({ noteId: note.id }).onConflictDoNothing();
  }
}

const list = await db
  .select({ id: notes.id, title: notes.title })
  .from(notes)
  .where(eq(notes.spaceId, DEV_SPACE_ID));

console.log(`USER=${user.id}`);
console.log(`NAME=${user.name}`);
console.log(`COOKIE=authjs.session-token=${sessionToken}`);
console.log(`SPACE=${DEV_SPACE_ID}`);
for (const n of list) console.log(`NOTE=${n.id} ${n.title}`);

await sql.end({ timeout: 3 });
