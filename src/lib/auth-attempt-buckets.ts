import { createHash } from "node:crypto";

/**
 * 로그인 시도 제한 버킷. DB 없이 테스트할 수 있게 계산만 따로 둔다.
 *
 * 예전에는 이메일 하나에 10회(15분)였다. 그러면 남의 이메일만 알아도 15분마다
 * 11번 틀려서 그 사람을 계속 잠가 둘 수 있었다. 그래서
 *
 *   email+address  10회  — 한 곳에서 한 계정을 두드리는 것(대부분의 대입 공격)
 *   email          100회 — 여러 곳에서 나눠 두드리는 것. 잠그려면 분산이 필요해진다
 *   address        60회  — 한 곳에서 여러 계정을 훑는 것
 */
export const AUTH_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

export type AuthAttemptBucket = { key: string; limit: number };

export function attemptKey(scope: "email" | "email-address" | "address", value: string) {
  return createHash("sha256").update(`${scope}:${value}`).digest("hex");
}

export function authAttemptBuckets(email: string, address: string): AuthAttemptBucket[] {
  return [
    { key: attemptKey("email-address", `${email}\n${address}`), limit: 10 },
    { key: attemptKey("email", email), limit: 100 },
    { key: attemptKey("address", address), limit: 60 },
  ];
}

/**
 * 성공하면 지울 버킷. 그 이메일의 버킷만 지우고 주소 버킷은 남긴다 —
 * 한 주소에서 여러 계정을 훑는 것은 성공했더라도 눌러 두는 편이 맞다.
 */
export function authAttemptKeysToClear(email: string, address: string): string[] {
  return [attemptKey("email-address", `${email}\n${address}`), attemptKey("email", email)];
}
