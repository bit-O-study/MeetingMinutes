export type SearchFilters = { q: string; space: string; status: string; from: string; to: string };

export function searchLimit(value: string) {
  const limit = Number(value);
  return Number.isSafeInteger(limit) && limit >= 30 ? Math.min(limit, 100) : 30;
}

export function searchHref(filters: SearchFilters, changes: Partial<SearchFilters> = {}, limit = 30) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...filters, ...changes })) {
    if (value) params.set(key, value);
  }
  // 조건을 바꾼 검색에서는 이전 조회 건수를 이어받지 않는다.
  if (limit > 30) params.set("limit", String(searchLimit(String(limit))));
  return `/search${params.size ? `?${params}` : ""}`;
}

export function searchParts(text: string, query: string): { text: string; match: boolean }[] {
  if (!query) return [{ text, match: false }];
  // 검색어를 정규식 문법으로 해석하지 않고 원문 위치 그대로 나눈다.
  const pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "giu");
  const parts: { text: string; match: boolean }[] = [];
  let end = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > end) parts.push({ text: text.slice(end, match.index), match: false });
    parts.push({ text: match[0], match: true });
    end = match.index + match[0].length;
  }
  if (end < text.length) parts.push({ text: text.slice(end), match: false });
  return parts;
}
