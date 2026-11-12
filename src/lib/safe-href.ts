/**
 * 본문 링크로 내보내도 되는 주소인지 거른다.
 *
 * 공유 열람 화면(ReadOnlyNote)은 로그인하지 않은 사람에게도 열린다. 본문 JSON의
 * href를 그대로 쓰면 `javascript:`·`data:` 링크가 우리 도메인에서 실행된다.
 * 에디터가 만들 수 있는 값(http·https·mailto)만 통과시킨다.
 */
const ALLOWED_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

export function safeLinkHref(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const href = value.trim();
  if (!href || href.length > 2048) return null;
  let url: URL;
  try {
    // 상대 주소는 받지 않는다. 기준 주소 없이 파싱되는 절대 주소만.
    url = new URL(href);
  } catch {
    return null;
  }
  return ALLOWED_PROTOCOLS.has(url.protocol) ? url.href : null;
}
