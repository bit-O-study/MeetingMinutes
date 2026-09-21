/**
 * ┌─────────────────────────────────────────────────────────────┐
 * │  S-05 · 검색        담당: CODEX                              │
 * └─────────────────────────────────────────────────────────────┘
 *
 * ★ 권한 필터를 조회 **이전에** 적용한다.
 *   mySpaceIds()로 범위를 먼저 좁힌 뒤 검색한다. 사후 필터링하면
 *   결과 건수만으로도 정보가 샌다. 총계도 필터 후 값이어야 한다.
 *
 * 결과 카드: 노트 제목 + 소속 스페이스 + 수정 시각 + 일치 문장 발췌
 *   발췌 앞에 **어느 블록에서 나왔는지**를 배지로 붙인다.
 *   ("막힌 것"에서 나온 결과가 가장 쓸모 있다)
 *
 * 필터: 스페이스 / 기간 / 상태
 * 결과 0 → 다른 스페이스 검색 제안
 *
 * 1차 검색은 notes.plainText ILIKE 로 충분하다.
 * 규모가 커지면 tsvector + pg_trgm으로 옮긴다 (drizzle/0001_search.sql 참고).
 */
import { SectionHeading } from "@/components/ui/Panels";
import { mySpaceIds } from "@/lib/access";

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.trim() : "";

  // 권한 범위를 먼저 확정한다.
  const spaceIds = await mySpaceIds();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-5 py-8">
      <SectionHeading>검색</SectionHeading>

      <form action="/search" className="flex gap-2">
        <input
          id="search-q"
          name="q"
          defaultValue={query}
          placeholder="노트 제목과 본문에서 찾기"
          className="min-w-0 flex-1 rounded border border-line bg-surface px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-3 focus:border-accent"
        />
        <button
          type="submit"
          className="rounded bg-accent px-4 py-2 text-sm text-on-accent transition-opacity hover:opacity-90"
        >
          검색
        </button>
      </form>

      {/* TODO(CODEX): spaceIds 범위 내 plainText ILIKE 검색 + 결과 카드 + 필터 */}
      <p className="font-mono text-xs text-ink-3">
        검색 범위: 내 스페이스 {spaceIds.length}개
      </p>
    </div>
  );
}
