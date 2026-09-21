import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// 메모리와 연산 비용을 함께 요구해 유출된 해시의 대입 공격 비용을 높인다.
const OPTIONS = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };

function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, OPTIONS, (error, key) => error ? reject(error) : resolve(key));
  });
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt-v1$${salt}$${(await derive(password, salt)).toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string | undefined) {
  const match = stored?.match(/^scrypt-v1\$([a-f0-9]{32})\$([a-f0-9]{128})$/);
  // 없는 계정도 같은 연산을 거쳐 응답 시간으로 계정 유무를 구별하기 어렵게 한다.
  const actual = await derive(password, match?.[1] ?? "0".repeat(32));
  const expected = Buffer.from(match?.[2] ?? "0".repeat(128), "hex");
  return timingSafeEqual(actual, expected) && Boolean(match);
}
