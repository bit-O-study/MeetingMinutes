/** 첨부만 렌더링한다. 외부 URL로 공유 토큰이나 열람자 정보를 보내지 않는다. */
export function noteImageUrl(value: unknown, shareToken?: string): string | null {
  if (typeof value !== "string" || !/^\/api\/attachments\/[0-9a-f-]{36}$/i.test(value)) return null;
  return shareToken ? `${value}?share=${encodeURIComponent(shareToken)}` : value;
}
