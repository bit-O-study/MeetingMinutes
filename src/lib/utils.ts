import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 조직 시간대 고정. 기한 계산이 사람마다 달라지면 지연 판정이 흔들린다. */
export const TIME_ZONE = "Asia/Seoul";

/** Asia/Seoul 기준 오늘 날짜를 YYYY-MM-DD로. 기한 비교의 기준값. */
export function todayInSeoul(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: TIME_ZONE }).format(new Date());
}

/**
 * 지연은 상태값이 아니라 계산 결과다.
 * 기한 다음 날부터 미완료인 항목을 지연으로 본다.
 */
export function isOverdue(dueDate: string | null, doneAt: Date | null): boolean {
  if (!dueDate || doneAt) return false;
  return dueDate < todayInSeoul();
}

/** "2시간 전", "어제" 처럼 목록에서 쓰는 짧은 표기 */
export function relativeTime(at: Date | string, now: Date = new Date()): string {
  const d = typeof at === "string" ? new Date(at) : at;
  const mins = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (mins < 1) return "방금";
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "어제";
  if (days < 7) return `${days}일 전`;
  return shortDate(d, now);
}

/**
 * "10. 23." 같은 짧은 날짜(서울 기준). 올해가 아니면 연도를 붙인다 —
 * 예전에는 1년 넘은 노트도 "10. 23."으로만 나와 올해 것처럼 보였다.
 */
export function shortDate(at: Date, now: Date = new Date()): string {
  const year = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric" }).format(d);
  const sameYear = year(at) === year(now);
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: TIME_ZONE,
    ...(sameYear ? {} : { year: "numeric" }),
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/**
 * 초대·공유 링크 토큰. 추측 불가능해야 한다.
 *
 * 16바이트(128비트)를 base64url로 그대로 적는다(22자, [A-Za-z0-9_-]).
 * 예전 방식은 바이트를 36진 두 자리로 적고 22자로 잘라 실제로는 약 88비트였다.
 * 이 파일은 클라이언트에서도 불러가므로 node:crypto 대신 Web Crypto를 쓴다.
 */
export function linkToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function absoluteUrl(path: string): string {
  // 빈 환경변수도 실제 값으로 취급되므로 ??만 쓰면 링크 생성·목록 조회가 함께 실패한다.
  // 별도 앱 주소가 없으면 공유 가능한 운영 도메인을 개별 배포 주소보다 우선한다.
  const candidates = [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_URL,
    "http://localhost:3000",
  ];
  for (const candidate of candidates) {
    const value = candidate?.trim();
    if (!value) continue;
    let base: URL;
    try {
      base = new URL(value.includes("://") ? value : `https://${value}`);
    } catch {
      continue;
    }
    if (!["https:", "http:"].includes(base.protocol) || base.username || base.password) continue;
    return new URL(path, base.origin).toString();
  }
  throw new Error("앱 주소를 구성할 수 없습니다.");
}
