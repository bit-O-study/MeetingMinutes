import { createHash } from "node:crypto";
import { eq, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { authAttempts, passwordCredentials, users } from "@/lib/db/schema";
import { hashPassword, verifyPassword } from "@/lib/password";

export async function allowAuthAttempt(email: string, address: string) {
  await db.delete(authAttempts).where(lt(authAttempts.expiresAt, new Date()));
  for (const [scope, value, limit] of [["email", email, 10], ["address", address, 60]] as const) {
    const key = createHash("sha256").update(`${scope}:${value}`).digest("hex");
    const [attempt] = await db.insert(authAttempts).values({
      key, count: 1, expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    }).onConflictDoUpdate({
      target: authAttempts.key, set: { count: sql`${authAttempts.count} + 1` },
    }).returning({ count: authAttempts.count });
    if (attempt.count > limit) return false;
  }
  return true;
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
