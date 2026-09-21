/**
 * ┌─────────────────────────────────────────────────────────────┐
 * │  S-02 · 스페이스        담당: CODEX                          │
 * └─────────────────────────────────────────────────────────────┘
 *
 * 탭 3개: 노트 / 할 일 / 멤버  (?tab= 쿼리로 구분)
 *
 *  · 노트  — 제목, **미해결 질문 수 배지**, 상태, 최근 수정자·시각
 *            미해결 질문 수는 notes.content의 taskList 중 checked=false 개수.
 *            이 배지가 있어야 다음 회차에 뭘 다룰지 목록에서 보인다.
 *  · 할 일 — 스페이스 전체. 담당자 없는 공용 할 일도 포함(내 할 일에는 안 나옴)
 *  · 멤버  — 목록 + 초대 링크 발급·재발급·만료 (소유자만)
 *
 * 헤더: 스페이스명, 용도 배지, 멤버 아바타, [+ 초대](소유자만), [⚙ 설정]
 * 우상단 [+ 새 노트] → S-02a 템플릿 선택 모달
 *
 * 권한: requireSpaceMember(spaceId). NotAccessibleError는 error.tsx가 받는다.
 */
import Link from "next/link";
import { and, desc, eq, isNull } from "drizzle-orm";

import { NoteStatusBadge } from "@/components/ui/Badge";
import { Card, EmptyState, SectionHeading } from "@/components/ui/Panels";
import { requireSpaceMember } from "@/lib/access";
import { db } from "@/lib/db";
import { notes } from "@/lib/db/schema";
import { relativeTime } from "@/lib/utils";

export default async function SpacePage({ params }: PageProps<"/s/[spaceId]">) {
  const { spaceId } = await params;
  const { space } = await requireSpaceMember(spaceId);

  const rows = await db
    .select()
    .from(notes)
    .where(and(eq(notes.spaceId, spaceId), isNull(notes.deletedAt)))
    .orderBy(desc(notes.updatedAt));

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-5 py-8">
      <SectionHeading
        action={
          <Link
            href={`/s/${spaceId}/new`}
            className="rounded bg-accent px-3 py-1.5 text-xs text-on-accent transition-opacity hover:opacity-90"
          >
            + 새 노트
          </Link>
        }
      >
        {space.name}
      </SectionHeading>

      {/* TODO(CODEX): 탭 3개(노트/할 일/멤버) + 멤버 아바타 + 초대 링크 */}

      <Card>
        <ul className="divide-y divide-line">
          {rows.map((note) => (
            <li key={note.id}>
              <Link
                href={`/s/${spaceId}/n/${note.id}`}
                className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-2"
              >
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{note.title}</span>
                {/* TODO(CODEX): 미해결 질문 수 배지 */}
                <NoteStatusBadge status={note.status} />
                <span className="font-mono text-[10px] text-ink-3">
                  {relativeTime(note.updatedAt)}
                </span>
              </Link>
            </li>
          ))}
          {rows.length === 0 && (
            <li>
              <EmptyState
                title="첫 노트를 만들어 보세요"
                action={{ href: `/s/${spaceId}/new`, label: "새 노트" }}
              />
            </li>
          )}
        </ul>
      </Card>
    </div>
  );
}
