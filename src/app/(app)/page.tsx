/**
 * ┌─────────────────────────────────────────────────────────────┐
 * │  S-01 · 홈        담당: CODEX                                │
 * └─────────────────────────────────────────────────────────────┘
 *
 * 화면 설계서 S-01 참고. 블록 순서가 설계 의도다 —
 * 노트는 찾으러 오지만 할 일은 알려 줘야 보기 때문에 할 일이 맨 위다.
 *
 * 해야 할 것
 *  1. 내 할 일  — 지연·오늘 우선, 최대 5건. 여기서 바로 체크(toggleTask 액션 사용)
 *  2. 최근 노트 — 소속 스페이스명과 함께, 최대 5건
 *  3. 내 스페이스 카드 — 노트 수·멤버 수·멤버 아바타(AvatarStack)
 *
 * 빈 상태
 *  - 스페이스 0  → EmptyState로 첫 스페이스 만들기 유도
 *  - 할 일 0     → 블록 자체를 숨긴다. 빈 카드는 소음이다.
 *
 * 쓸 것: Card/CardTitle/EmptyState(@/components/ui/Panels),
 *        DueBadge/NoteStatusBadge(@/components/ui/Badge), AvatarStack,
 *        isOverdue/todayInSeoul/relativeTime(@/lib/utils),
 *        toggleTask(@/lib/actions/tasks)
 */
import Link from "next/link";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";

import { Card, CardTitle, EmptyState, SectionHeading } from "@/components/ui/Panels";
import { NoteStatusBadge } from "@/components/ui/Badge";
import { listMySpaces } from "@/lib/access";
import { db } from "@/lib/db";
import { notes } from "@/lib/db/schema";
import { relativeTime } from "@/lib/utils";

export default async function HomePage() {
  const spaceRows = await listMySpaces();
  const spaceIds = spaceRows.map((r) => r.space.id);
  const spaceName = new Map(spaceRows.map((r) => [r.space.id, r.space.name]));

  const recent = spaceIds.length
    ? await db
        .select()
        .from(notes)
        .where(and(inArray(notes.spaceId, spaceIds), isNull(notes.deletedAt)))
        .orderBy(desc(notes.updatedAt))
        .limit(5)
    : [];

  if (spaceIds.length === 0) {
    return (
      <div className="mx-auto w-full max-w-3xl px-5 py-8">
        <Card>
          <EmptyState
            title="첫 스페이스를 만들어 보세요"
            hint="스터디 회차를 모아 두거나, 인수인계 메모를 함께 정리할 공간입니다."
            action={{ href: "/spaces/new", label: "새 스페이스" }}
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-5 py-8">
      <SectionHeading>홈</SectionHeading>

      {/* TODO(CODEX): 내 할 일 블록 — 지연/오늘 우선, 인라인 체크 */}

      <Card>
        <CardTitle>최근 노트</CardTitle>
        <ul className="divide-y divide-line">
          {recent.map((note) => (
            <li key={note.id}>
              <Link
                href={`/s/${note.spaceId}/n/${note.id}`}
                className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-2"
              >
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{note.title}</span>
                <NoteStatusBadge status={note.status} />
                <span className="hidden font-mono text-[10px] text-ink-3 sm:inline">
                  {spaceName.get(note.spaceId)}
                </span>
                <span className="font-mono text-[10px] text-ink-3">
                  {relativeTime(note.updatedAt)}
                </span>
              </Link>
            </li>
          ))}
          {recent.length === 0 && (
            <li>
              <EmptyState title="아직 노트가 없습니다" />
            </li>
          )}
        </ul>
      </Card>

      {/* TODO(CODEX): 내 스페이스 카드 그리드 — 노트 수·멤버 수·아바타 */}
      <Card>
        <CardTitle>내 스페이스</CardTitle>
        <ul className="divide-y divide-line">
          {spaceRows.map(({ space }) => (
            <li key={space.id}>
              <Link
                href={`/s/${space.id}`}
                className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-2"
              >
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{space.name}</span>
                <span className="font-mono text-[10px] text-ink-3">
                  {relativeTime(space.lastActivityAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
