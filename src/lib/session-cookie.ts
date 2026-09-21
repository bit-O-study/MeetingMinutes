// Auth.js의 조회·로그아웃과 자체 로그인에서 쿠키 이름 및 보안 속성을 공유한다.
export const sessionCookie = {
  name: process.env.NODE_ENV === "production" ? "__Secure-authjs.session-token" : "authjs.session-token",
  options: {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: process.env.NODE_ENV === "production",
  },
};
