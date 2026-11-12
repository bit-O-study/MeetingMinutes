import type { NextConfig } from "next";

/**
 * 모든 응답에 붙이는 보안 헤더.
 *
 *   frame-ancestors / X-Frame-Options  다른 사이트가 이 앱을 iframe으로 감싸 클릭을 가로채지 못하게
 *   X-Content-Type-Options              업로드·응답을 브라우저가 다른 형식으로 짐작해 실행하지 못하게
 *   Referrer-Policy                     다른 사이트로 나갈 때 경로(공유·초대 토큰이 든)를 보내지 않게
 *
 * 스크립트 CSP는 넣지 않는다. Next의 인라인 스크립트에 nonce를 붙이려면 모든 페이지가
 * 동적 렌더가 되어야 해서 별도 작업으로 둔다.
 */
const baseHeaders = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

/** 주소 자체가 열쇠인 화면. 같은 사이트 안에서도 Referer로 토큰을 흘리지 않는다. */
const tokenPageHeaders = [{ key: "Referrer-Policy", value: "no-referrer" }];

const nextConfig: NextConfig = {
  output: "standalone",
  // 사진·패키지 업로드가 프록시 기본 본문 한도에 걸리지 않게 한다.
  experimental: { proxyClientMaxBodySize: "65mb" },
  async headers() {
    return [
      { source: "/:path*", headers: baseHeaders },
      { source: "/p/:token*", headers: tokenPageHeaders },
      { source: "/join/:token*", headers: tokenPageHeaders },
    ];
  },
};

export default nextConfig;
