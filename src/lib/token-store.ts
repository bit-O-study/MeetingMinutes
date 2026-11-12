/**
 * 토큰을 DB에 저장하는 방식. 서버 전용(node:crypto).
 *
 * 세션·초대·공유 토큰은 그 자체가 열쇠다. DB 행을 읽을 수 있는 사람(백업, 잘못 열린
 * Data API, 로그)이 그 값을 그대로 쓰지 못하도록 **조회 키는 해시로만** 저장한다.
 *
 *   세션       sessions.session_token = "sha256:<hex>"
 *   초대·공유  token_hash = sha256 hex (조회용)
 *              token      = "enc1:<암호문>" (화면에 링크를 다시 보여 주기 위한 사본)
 *
 * 초대·공유 링크는 소유자가 목록에서 다시 복사할 수 있어야 해서 해시만 둘 수 없다.
 * 그래서 사본은 AUTH_SECRET에서 파생한 키로 암호화한다. DB만 새어서는 링크를 만들 수 없다.
 */
import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";

import type { Adapter, AdapterSession } from "next-auth/adapters";

/* ── 세션 ─────────────────────────────────────────────────── */

const SESSION_PREFIX = "sha256:";

/** 쿠키에 든 세션 토큰 → DB에 저장하는 값 */
export function hashSessionToken(token: string): string {
  return SESSION_PREFIX + createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * 해시 형식인지. 이 형식의 값은 쿠키로 받아도 평문 조회를 하지 않는다 —
 * DB에서 읽은 해시를 쿠키로 내밀어 로그인하는 것을 막는다.
 */
export function isHashedSessionToken(value: string): boolean {
  return value.startsWith(SESSION_PREFIX);
}

type SessionAdapter = Required<
  Pick<Adapter, "createSession" | "getSessionAndUser" | "updateSession" | "deleteSession">
>;

/**
 * Auth.js 어댑터를 감싸 세션 토큰을 해시로 저장·조회한다.
 *
 * Auth.js는 쿠키 값을 그대로 어댑터에 넘기고, 쿠키를 다시 쓸 때도 자기가 가진 값을 쓴다
 * (@auth/core lib/actions/session.js). 그래서 어댑터 안에서만 바꿔 주면 된다.
 *
 * 옛 평문 행은 처음 조회될 때 `renameLegacy`로 해시로 바꾼다. 배포 순간 모두가
 * 로그아웃되지 않게 하려는 것이다. 접두사가 붙은 쿠키 값은 평문 조회를 건너뛴다.
 */
export function withHashedSessions<A extends SessionAdapter>(
  base: A,
  renameLegacy: (legacyToken: string, hashed: string) => Promise<void>,
): A {
  const restore = <S extends AdapterSession | null | undefined>(session: S, token: string): S =>
    session ? ({ ...session, sessionToken: token } as S) : session;

  return {
    ...base,
    async createSession(session) {
      const created = await base.createSession({ ...session, sessionToken: hashSessionToken(session.sessionToken) });
      return restore(created, session.sessionToken);
    },
    async getSessionAndUser(token) {
      const found = await base.getSessionAndUser(hashSessionToken(token));
      if (found) return { ...found, session: restore(found.session, token) };
      if (isHashedSessionToken(token)) return null;

      const legacy = await base.getSessionAndUser(token);
      if (!legacy) return null;
      try {
        await renameLegacy(token, hashSessionToken(token));
      } catch {
        // 동시 요청이 먼저 바꿨을 수 있다. 다음 조회는 해시로 찾는다.
      }
      return { ...legacy, session: restore(legacy.session, token) };
    },
    async updateSession(session) {
      const updated = await base.updateSession({ ...session, sessionToken: hashSessionToken(session.sessionToken) });
      return restore(updated, session.sessionToken);
    },
    async deleteSession(token) {
      await base.deleteSession(hashSessionToken(token));
      if (!isHashedSessionToken(token)) await base.deleteSession(token);
      return null;
    },
  };
}

/* ── 초대·공유 링크 ────────────────────────────────────────── */

/** 링크 토큰 조회 키. 0008 마이그레이션의 encode(sha256(convert_to(token,'UTF8')),'hex')와 같다. */
export function hashLinkToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

const SEALED_PREFIX = "enc1:";

function linkKey(secret: string): Buffer {
  return Buffer.from(hkdfSync("sha256", secret, "", "meeting-minutes/link-token/v1", 32));
}

function appSecret(): string {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET이 설정되지 않았습니다.");
  return secret;
}

/** 표시용 사본을 암호화한다. AES-256-GCM, 매번 다른 IV. */
export function sealLinkToken(token: string, secret: string = appSecret()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", linkKey(secret), iv);
  const body = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return SEALED_PREFIX + Buffer.concat([iv, body, cipher.getAuthTag()]).toString("base64url");
}

/**
 * 표시용 사본을 푼다. 옛 평문 행은 그대로 돌려준다.
 * 키가 바뀌어(AUTH_SECRET 교체) 풀 수 없으면 null — 그 링크는 다시 발급해야 한다.
 */
export function openLinkToken(stored: string, secret: string = appSecret()): string | null {
  if (!stored.startsWith(SEALED_PREFIX)) return stored;
  try {
    const raw = Buffer.from(stored.slice(SEALED_PREFIX.length), "base64url");
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(raw.length - 16);
    const body = raw.subarray(12, raw.length - 16);
    const decipher = createDecipheriv("aes-256-gcm", linkKey(secret), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export function isSealedLinkToken(stored: string): boolean {
  return stored.startsWith(SEALED_PREFIX);
}

/** 새 링크 행에 넣을 두 값 */
export function storedLinkToken(token: string): { token: string; tokenHash: string } {
  return { token: sealLinkToken(token), tokenHash: hashLinkToken(token) };
}
