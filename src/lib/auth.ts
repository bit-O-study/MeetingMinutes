import { DrizzleAdapter } from "@auth/drizzle-adapter";
import NextAuth from "next-auth";
import { cache } from "react";

import { db } from "@/lib/db";
import { accounts, sessions, users, verificationTokens } from "@/lib/db/schema";
import { sessionCookie } from "@/lib/session-cookie";

const authConfig = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  // 비밀번호 검증은 서버 액션에서, 세션 조회·로그아웃은 기존 DB 전략으로 처리한다.
  providers: [],
  cookies: { sessionToken: sessionCookie },
  session: { strategy: "database" },
  pages: { signIn: "/login" },
  callbacks: {
    session({ session, user }) {
      if (session.user) session.user.id = user.id;
      return session;
    },
  },
});

export const { handlers, signIn, signOut } = authConfig;
// 같은 렌더의 레이아웃·페이지·권한 검사만 공유한다. 다른 요청의 세션은 캐시하지 않는다.
export const auth = cache(() => authConfig.auth());

/** 로그인이 필요한 서버 코드에서 쓴다. 없으면 던진다. */
export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new UnauthenticatedError();
  }
  return { id: session.user.id, name: session.user.name, image: session.user.image };
}

export class UnauthenticatedError extends Error {
  constructor() {
    super("로그인이 필요합니다.");
    this.name = "UnauthenticatedError";
  }
}
