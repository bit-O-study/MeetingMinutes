"use server";

import { randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { sessions } from "@/lib/db/schema";
import { hashSessionToken, isHashedSessionToken } from "@/lib/token-store";
import { loginInput, loginReturnTo, registrationInput } from "@/lib/login-input";
import { allowAuthAttempt, authenticatePasswordUser, clearAuthAttempts, registerPasswordUser } from "@/lib/password-auth";
import { sessionCookie } from "@/lib/session-cookie";

function fail(mode: "login" | "register", error: string, returnTo: string): never {
  redirect(`/login?${new URLSearchParams({ mode, error, returnTo })}`);
}

async function startSession(userId: string) {
  const jar = await cookies();
  const previous = jar.get(sessionCookie.name)?.value;
  const sessionToken = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await db.transaction(async (tx) => {
    // 이전 세션은 해시 행과 (전환 전) 평문 행을 모두 지운다.
    if (previous) {
      const stale = isHashedSessionToken(previous) ? [hashSessionToken(previous)] : [hashSessionToken(previous), previous];
      await tx.delete(sessions).where(inArray(sessions.sessionToken, stale));
    }
    // DB에는 해시만 둔다. 쿠키의 원문은 이 응답 밖에 남지 않는다.
    await tx.insert(sessions).values({ sessionToken: hashSessionToken(sessionToken), userId, expires });
  });
  jar.set(sessionCookie.name, sessionToken, { ...sessionCookie.options, expires });
}

async function submit(formData: FormData, mode: "login" | "register") {
  const returnTo = loginReturnTo(formData.get("returnTo"));
  const raw = Object.fromEntries(formData);
  const parsed = (mode === "register" ? registrationInput : loginInput).safeParse(raw);
  if (!parsed.success) fail(mode, "invalid", returnTo);

  let userId: string | null = null;
  let error: string | null = null;
  const requestHeaders = await headers();
  // Vercel이 덮어쓰는 주소만 신뢰한다. 다른 호스트에서는 공통 제한을 적용한다.
  const address = process.env.VERCEL ? requestHeaders.get("x-vercel-forwarded-for") ?? "unknown" : "local";
  try {
    if (!await allowAuthAttempt(parsed.data.email, address)) {
      error = "limited";
    } else if (mode === "register") {
      userId = await registerPasswordUser(registrationInput.parse(raw));
      if (!userId) error = "unavailable";
    } else {
      userId = await authenticatePasswordUser(parsed.data.email, parsed.data.password);
      if (!userId) error = "credentials";
    }
    if (userId) {
      await clearAuthAttempts(parsed.data.email, address);
      await startSession(userId);
    }
  } catch {
    // DB 오류에는 쿼리 매개변수가 담길 수 있어 비밀번호·세션을 로그에 남기지 않는다.
    console.error("[password-auth] 인증 처리 중 저장소 오류가 발생했습니다.");
    error = "server";
  }
  if (error) fail(mode, error, returnTo);
  redirect(returnTo);
}

export async function passwordSignIn(formData: FormData) {
  await submit(formData, "login");
}

export async function passwordSignUp(formData: FormData) {
  await submit(formData, "register");
}
