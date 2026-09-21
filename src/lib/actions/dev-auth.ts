"use server";

import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, desc, eq, like } from "drizzle-orm";

import { db } from "@/lib/db";
import { noteDocs, notes, sessions, spaceMembers, spaces, users } from "@/lib/db/schema";
import { buildTemplateDoc, docToPlainText } from "@/lib/templates";

/**
 * 개발 전용 임시 로그인.
 *
 * 구글 OAuth 없이 이름만으로 들어간다. 공동 편집을 테스트하려면
 * 서로 다른 사용자 둘이 같은 노트를 열어야 하므로, 사용자 전환이 쉬워야 한다.
 *
 * ── 왜 Credentials 프로바이더를 쓰지 않았나 ────────────────
 * Auth.js의 Credentials 프로바이더는 JWT 세션에서만 동작한다.
 * 그것 때문에 세션 전략을 바꾸면 개발과 운영의 동작이 갈라지고,
 * 운영에서만 나는 버그가 생긴다.
 * 그래서 전략은 database 그대로 두고, 세션 행을 직접 만들어 쿠키만 심는다.
 * 로그인 이후의 모든 경로는 구글 로그인과 완전히 같다.
 */

const DEV_EMAIL_SUFFIX = "@dev.local";
const SESSION_DAYS = 30;

/** https가 아니므로 Auth.js는 접두사 없는 쿠키를 읽는다. */
const SESSION_COOKIE = "authjs.session-token";

function assertDev() {
  if (process.env.NODE_ENV !== "development") {
    throw new Error("개발 환경에서만 사용할 수 있습니다.");
  }
}

/** 이미 만들어 둔 개발 계정 목록. 클릭 한 번으로 전환하려고 쓴다. */
export async function listDevUsers() {
  if (process.env.NODE_ENV !== "development") return [];

  return db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(like(users.email, `%${DEV_EMAIL_SUFFIX}`))
    .orderBy(desc(users.createdAt))
    .limit(8);
}

export async function devSignIn(formData: FormData) {
  assertDev();

  const raw = String(formData.get("name") ?? "").trim();
  const name = raw || "개발자";

  // 같은 이름으로 다시 들어오면 같은 계정을 쓴다.
  const email = `${encodeURIComponent(name.toLowerCase())}${DEV_EMAIL_SUFFIX}`;

  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  const user =
    existing ??
    (
      await db
        .insert(users)
        .values({ name, email, emailVerified: new Date() })
        .returning()
    )[0];

  await startSession(user.id);
  await ensureDevWorkspace(user.id);
  redirect("/");
}

/** 기존 개발 계정으로 바로 전환 */
export async function devSignInAs(userId: string) {
  assertDev();

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user?.email.endsWith(DEV_EMAIL_SUFFIX)) {
    throw new Error("개발 계정이 아닙니다.");
  }

  await startSession(user.id);
  await ensureDevWorkspace(user.id);
  redirect("/");
}

/**
 * 개발용 공유 스페이스.
 *
 * 스페이스 생성 화면(/spaces/new)은 Codex 담당이라 아직 없다. 그게 없으면
 * 로그인 직후가 막다른 길이 되므로 개발 계정은 이 스페이스로 바로 들어간다.
 *
 * ★ 모든 개발 계정이 **같은** 스페이스에 들어가야 공동 편집을 확인할 수 있다.
 *   각자 자기 스페이스를 만들면 같은 노트를 열 수가 없다.
 *   그래서 id를 상수로 고정한다.
 */
const DEV_SPACE_ID = "00000000-0000-4000-8000-000000000001";

async function ensureDevWorkspace(userId: string) {
  const [space] = await db.select().from(spaces).where(eq(spaces.id, DEV_SPACE_ID)).limit(1);

  if (!space) {
    await db
      .insert(spaces)
      .values({
        id: DEV_SPACE_ID,
        name: "개발 스터디 (샘플)",
        kind: "study",
        ownerId: userId,
      })
      .onConflictDoNothing();
  }

  // 이미 멤버면 그대로 둔다.
  const [membership] = await db
    .select({ userId: spaceMembers.userId })
    .from(spaceMembers)
    .where(and(eq(spaceMembers.spaceId, DEV_SPACE_ID), eq(spaceMembers.userId, userId)))
    .limit(1);

  if (!membership) {
    await db
      .insert(spaceMembers)
      .values({
        spaceId: DEV_SPACE_ID,
        userId,
        role: space ? "member" : "owner",
      })
      .onConflictDoNothing();
  }

  const existingNotes = await db
    .select({ id: notes.id })
    .from(notes)
    .where(eq(notes.spaceId, DEV_SPACE_ID))
    .limit(1);

  if (existingNotes.length > 0) return;

  await seedNote(userId, "study", "1회차", 1);
  await seedNote(userId, "handover", "결제 배치 인수인계", null);
}

async function seedNote(
  userId: string,
  template: "study" | "handover",
  title: string,
  sessionNo: number | null,
) {
  const content = buildTemplateDoc(template, sessionNo ?? 1);

  const [note] = await db
    .insert(notes)
    .values({
      spaceId: DEV_SPACE_ID,
      title,
      template,
      content,
      plainText: docToPlainText(content),
      sessionNo,
      createdBy: userId,
      updatedBy: userId,
    })
    .returning();

  await db.insert(noteDocs).values({ noteId: note.id }).onConflictDoNothing();
}

async function startSession(userId: string) {
  const sessionToken = randomUUID() + randomUUID().replace(/-/g, "");
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await db.insert(sessions).values({ sessionToken, userId, expires });

  const jar = await cookies();
  jar.set(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires,
  });
}
