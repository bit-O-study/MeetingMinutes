import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Noto_Sans_KR, Noto_Serif_KR } from "next/font/google";

import "./globals.css";

const notoSans = Noto_Sans_KR({ variable: "--font-ui-sans", subsets: ["latin"], display: "swap" });
const notoSerif = Noto_Serif_KR({ variable: "--font-ui-serif", subsets: ["latin"], weight: ["600", "700"], display: "swap" });

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

/**
 * 휴대폰 화면 설정. resizes-content — 키보드가 올라오면 화면 높이가 그만큼 줄어서,
 * 노트 본문의 커서와 입력칸이 키보드 밑에 숨지 않는다(노트 본문 키보드 문제 의심 지점).
 * viewport-fit=cover 는 아래 메뉴가 안전 영역(--safe-top/--safe-bottom, globals.css)을 쓰기 위해.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "rgb(244 242 237)" },
    { media: "(prefers-color-scheme: dark)", color: "#0f131b" },
  ],
};

export const metadata: Metadata = {
  title: { default: "모아", template: "%s · 모아" },
  description: "팀의 대화·노트·이슈를 한곳에 모아 같이 정리하는 도구",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${notoSans.variable} ${notoSerif.variable} ${plexMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* 안드로이드 앱(WebView, UA 에 "; wv)")이면 안전 영역 여백을 끈다. 첫 그림 전에 정해야 막대가 늘었다 줄지 않는다. */}
        <script dangerouslySetInnerHTML={{ __html: `if(navigator.userAgent.indexOf("; wv)")>-1)document.documentElement.dataset.shell="app";try{var t=localStorage.getItem("moa:theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}` }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
