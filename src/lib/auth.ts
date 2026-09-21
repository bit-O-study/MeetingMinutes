import { DrizzleAdapter } from "@auth/drizzle-adapter";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

import { db } from "@/lib/db";
import { accounts, sessions, users, verificationTokens } from "@/lib/db/schema";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers: [Google],
  session: { strategy: "database" },
  pages: { signIn: "/login" },
  callbacks: {
    session({ session, user }) {
      if (session.user) session.user.id = user.id;
      return session;
    },
  },
});

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
