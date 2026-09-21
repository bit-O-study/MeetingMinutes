/**
 * S-05 검색 · CODEX
 * 소속 스페이스로 검색 범위를 먼저 확정하고 URL에 필터를 유지한다.
 */
import Link from "next/link";
import { Card, EmptyState, SectionHeading } from "@/components/ui/Panels";
import { listMySpaces, mySpaceIds } from "@/lib/access";
import { searchNotes } from "@/lib/actions/search";
import { Badge, NoteStatusBadge } from "@/components/ui/Badge";
import { relativeTime } from "@/lib/utils";

function one(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

function validDate(value: string) {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const params = await searchParams;
  const query = one(params.q).trim();
  // 액션에도 이 범위를 전달하고, 선택한 공간이 범위 밖이면 검색을 실행하지 않는다.
  const spaceIds = await mySpaceIds();
  const spaces = (await listMySpaces()).filter((row) => spaceIds.includes(row.space.id));
  const requestedSpace = one(params.space);
  const invalidSpace = Boolean(requestedSpace && !spaceIds.includes(requestedSpace));
  const selectedSpace = invalidSpace ? "" : requestedSpace;
  const from = one(params.from);
  const to = one(params.to);
  const invalidDates = !validDate(from) || !validDate(to) || Boolean(from && to && from > to);
  const status = params.status === "draft" || params.status === "tidied" ? params.status : "";
  const inputClass = "w-full rounded border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none";
  const formKey = [query, selectedSpace, from, to, status].join("|");
  const result = query && !invalidSpace && !invalidDates && spaceIds.length > 0
    ? await searchNotes(query, { spaceIds: selectedSpace ? [selectedSpace] : spaceIds, from, to, status: status || null, limit: 30 })
    : { total: 0, hits: [] };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-5 py-8">
      <SectionHeading>검색</SectionHeading>
      <form key={formKey} action="/search" method="get" className="space-y-4">
        <div>
          <label htmlFor="search-q" className="mb-2 block text-sm font-medium text-ink">검색어</label>
          <div className="flex gap-2">
            <input id="search-q" name="q" type="search" defaultValue={query} maxLength={200}
              placeholder="노트 제목과 본문에서 찾기" className={inputClass + " min-w-0 flex-1"} />
            <button type="submit" className="shrink-0 rounded bg-accent px-4 py-2 text-sm text-on-accent hover:opacity-90">검색</button>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="search-space" className="mb-1 block text-xs text-ink-2">스페이스</label>
            <select id="search-space" name="space" defaultValue={selectedSpace} className={inputClass}>
              <option value="">내 스페이스 전체</option>
              {spaces.map(({ space }) => <option key={space.id} value={space.id}>{space.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="search-status" className="mb-1 block text-xs text-ink-2">노트 상태</label>
            <select id="search-status" name="status" defaultValue={status} className={inputClass}>
              <option value="">전체</option><option value="draft">작성 중</option><option value="tidied">정리됨</option>
            </select>
          </div>
          <div>
            <label htmlFor="search-from" className="mb-1 block text-xs text-ink-2">수정일 시작</label>
            <input id="search-from" name="from" type="date" defaultValue={validDate(from) ? from : ""} className={inputClass} aria-invalid={invalidDates || undefined} aria-describedby={invalidDates ? "search-error" : undefined} />
          </div>
          <div>
            <label htmlFor="search-to" className="mb-1 block text-xs text-ink-2">수정일 종료</label>
            <input id="search-to" name="to" type="date" defaultValue={validDate(to) ? to : ""} className={inputClass} aria-invalid={invalidDates || undefined} aria-describedby={invalidDates ? "search-error" : undefined} />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-3">
          <p>검색 범위: 내 스페이스 {spaceIds.length}개 · 날짜는 한국 시간 기준</p>
          <Link href="/search" className="text-ink-2 hover:text-accent">검색 조건 초기화</Link>
        </div>
      </form>
      {invalidSpace || invalidDates ? (
        <p id="search-error" role="alert" className="rounded border border-line bg-warn-soft p-3 text-sm text-warn">
          {invalidSpace ? "선택한 검색 범위를 사용할 수 없습니다. 검색 조건을 다시 선택해 주세요." : "검색 기간을 확인해 주세요. 시작일은 종료일보다 늦을 수 없습니다."}
        </p>
      ) : spaceIds.length === 0 ? (
        <Card><EmptyState title="검색할 스페이스가 없습니다" hint="참여 중인 스페이스의 노트를 검색할 수 있습니다." action={{ href: "/", label: "홈으로" }} /></Card>
      ) : !query ? (
        <Card><EmptyState title="찾고 싶은 내용을 입력해 주세요" hint="제목이나 본문의 단어로 함께 작성한 노트를 찾습니다." /></Card>
      ) : result.hits.length === 0 ? (
        <Card>
          <EmptyState title="검색 결과가 없습니다" hint="다른 단어를 입력하거나 스페이스·기간·상태 조건을 넓혀 보세요." />
        </Card>
      ) : (
        <section aria-label="검색 결과" className="space-y-3">
          <p className="text-sm text-ink-2">
            {result.total !== result.hits.length ? `${result.total}건 중 상위 ${result.hits.length}건` : `${result.total}건`} · 최근 수정순
          </p>
          <ul className="space-y-3">
            {result.hits.map((hit) => (
              <li key={hit.id}><Card>
                <Link href={`/s/${hit.spaceId}/n/${hit.id}`} className="block space-y-2 p-4 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="min-w-0 break-words text-sm font-semibold text-ink">{hit.title}</h2>
                    <NoteStatusBadge status={hit.status} />
                    {hit.section && <Badge tone={hit.section.includes("질문") ? "accent" : "info"} className="whitespace-normal break-words">일치 구획 · {hit.section}</Badge>}
                  </div>
                  <p className="text-xs text-ink-3">{hit.spaceName} · {relativeTime(hit.updatedAt)} 수정</p>
                  {hit.snippet && <p className="break-words text-sm leading-relaxed text-ink-2">{hit.snippet}</p>}
                </Link>
              </Card></li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
