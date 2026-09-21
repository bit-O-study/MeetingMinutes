/**
 * ┌─────────────────────────────────────────────────────────────┐
 * │  S-04 · 내 할 일        담당: CODEX                          │
 * └─────────────────────────────────────────────────────────────┘
 *
 * 스페이스 전체에서 assigneeId = 나 인 항목만 모은다.
 * 담당자 없는 공용 할 일은 여기 나오지 않는다 (스페이스 화면에서 본다).
 *
 * 묶음 순서: 지연 → 이번 주 → 그 이후 → 기한 없음 → 완료
 *
 * ★ 지연을 상태 필터 칩으로 만들지 말 것.
 *   기능 설계 §7.2에서 지연은 상태값이 아니라 기한+완료여부의 계산 결과다.
 *   필터가 아니라 **묶음 제목**으로 표현하면 이 구분이 화면에서도 지켜진다.
 *   상태 필터는 미완료 / 완료 / 전체 셋뿐이다.
 *
 * 각 항목: 내용, 출처 노트 링크, 기한(DueBadge), 체크박스
 * 체크 한 번으로 완료, 다시 눌러 되돌리기 → toggleTask()
 *
 * 쓸 것: toggleTask(@/lib/actions/tasks), isOverdue/todayInSeoul(@/lib/utils),
 *        DueBadge(@/components/ui/Badge)
 */
import Link from "next/link";
import { and, asc, eq, isNull } from "drizzle-orm";

import { DueBadge } from "@/components/ui/Badge";
import { Card, EmptyState, SectionHeading } from "@/components/ui/Panels";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { notes, tasks } from "@/lib/db/schema";
import { isOverdue, todayInSeoul } from "@/lib/utils";

export default async function TasksPage() {
  const user = await requireUser();
  const today = todayInSeoul();

  const rows = await db
    .select({ task: tasks, noteTitle: notes.title, spaceId: notes.spaceId })
    .from(tasks)
    .innerJoin(notes, eq(notes.id, tasks.noteId))
    .where(and(eq(tasks.assigneeId, user.id), isNull(tasks.doneAt)))
    .orderBy(asc(tasks.dueDate));

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-5 py-8">
      <SectionHeading>내 할 일</SectionHeading>

      {/* TODO(CODEX): 미완료/완료/전체 필터 + 지연·이번 주·이후·기한 없음 묶음 */}

      <Card>
        <ul className="divide-y divide-line">
          {rows.map(({ task, noteTitle, spaceId }) => (
            <li key={task.id} className="flex items-start gap-3 px-4 py-2.5">
              {/* TODO(CODEX): toggleTask 서버 액션에 연결된 체크박스 */}
              <span className="pt-0.5 font-mono text-xs text-ink-3">☐</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-ink">{task.body}</p>
                <Link
                  href={`/s/${spaceId}/n/${task.noteId}`}
                  className="font-mono text-[10px] text-ink-3 hover:text-accent"
                >
                  {noteTitle}
                </Link>
              </div>
              <DueBadge
                dueDate={task.dueDate}
                overdue={isOverdue(task.dueDate, task.doneAt)}
                today={today}
              />
            </li>
          ))}
          {rows.length === 0 && (
            <li>
              <EmptyState title="할 일이 없습니다" hint="노트에서 만든 할 일이 여기 모입니다." />
            </li>
          )}
        </ul>
      </Card>
    </div>
  );
}
