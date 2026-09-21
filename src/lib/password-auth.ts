import { createHash } from "node:crypto";
import { eq, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { authAttempts, passwordCredentials, users } from "@/lib/db/schema";
import { hashPassword, verifyPassword } from "@/lib/password";

function attemptKey(scope: "email" | "address", value: string) {
  return createHash("sha256").update(`${scope}:${value}`).digest("hex");
}

export async function allowAuthAttempt(email: string, address: string) {
  await db.delete(authAttempts).where(lt(authAttempts.expiresAt, new Date()));
  for (const [scope, value, limit] of [["email", email, 10], ["address", address, 60]] as const) {
    const [attempt] = await db.insert(authAttempts).values({
      key: attemptKey(scope, value), count: 1, expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    }).onConflictDoUpdate({
      target: authAttempts.key, set: { count: sql`${authAttempts.count} + 1` },
    }).returning({ count: authAttempts.count });
    if (attempt.count > limit) return false;
  }
  return true;
}

/**
 * 들어오는 데 성공하면 그 이메일의 누적을 지운다.
 *
 * 지우지 않으면 제한이 "실패 횟수"가 아니라 "시도 횟수"가 된다. 공동 편집을
 * 확인하느라 두 계정을 번갈아 로그인하는 것만으로도 15분간 막히고,
 * 화면에는 "시도가 너무 많습니다"만 뜬다. 주소 버킷은 손대지 않는다 —
 * 한 주소에서 여러 계정을 훑는 것은 성공했더라도 눌러 두는 편이 맞다.
 */
export async function clearAuthAttempts(email: string) {
  await db.delete(authAttempts).where(eq(authAttempts.key, attemptKey("email", email)));
}

export async function registerPasswordUser(input: { email: string; name: string; password: string }) {
  const passwordHash = await hashPassword(input.password);
  return db.transaction(async (tx) => {
    // 동시 가입을 직렬화하고 기존 소셜 계정에는 비밀번호를 임의로 붙이지 않는다.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${input.email}))`);
    const [existing] = await tx.select({ id: users.id }).from(users)
      .where(sql`lower(trim(${users.email})) = ${input.email}`).limit(1);
    if (existing) return null;
    const [user] = await tx.insert(users).values({ email: input.email, name: input.name }).returning({ id: users.id });
    await tx.insert(passwordCredentials).values({ email: input.email, userId: user.id, passwordHash });
    return user.id;
  });
}

export async function authenticatePasswordUser(email: string, password: string) {
  const [credential] = await db.select().from(passwordCredentials).where(eq(passwordCredentials.email, email)).limit(1);
  const valid = await verifyPassword(password, credential?.passwordHash);
  return valid ? credential?.userId ?? null : null;
}
