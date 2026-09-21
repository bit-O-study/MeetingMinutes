/**
 * S-01 홈 · CODEX
 * 할 일은 먼저 알려 주고, 노트와 스페이스는 이어서 찾아갈 수 있게 한다.
 */
import Link from "next/link";
import { and, asc, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { Card, CardTitle, EmptyState, SectionHeading } from "@/components/ui/Panels";
import { NoteStatusBadge } from "@/components/ui/Badge";
import { AvatarStack } from "@/components/ui/Avatar";
import { TaskRow } from "@/components/screens/TaskRow";
import { listMySpaces } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { notes, spaceMembers, tasks, users } from "@/lib/db/schema";
import { isOverdue, relativeTime, todayInSeoul } from "@/lib/utils";

export default async function HomePage() {
  const spaceRows = await listMySpaces();
  spaceRows.sort((a, b) => b.space.lastActivityAt.getTime() - a.space.lastActivityAt.getTime());
  const spaceIds = spaceRows.map((row) => row.space.id);
  const spaceName = new Map(spaceRows.map((row) => [row.space.id, row.space.name]));

  if (spaceIds.length === 0) {
    return (
      <div className="mx-auto w-full max-w-3xl px-5 py-8">
        <SectionHeading>홈</SectionHeading>
        <Card>
          <EmptyState title="첫 스페이스를 만들어 보세요"
            hint="스터디 회차를 모아 두거나, 인수인계 메모를 함께 정리할 공간입니다."
            action={{ href: "/spaces/new", label: "새 스페이스" }} />
        </Card>
      </div>
    );
  }

  const user = await requireUser();
  const today = todayInSeoul();
  // 소속을 확인한 범위만 조회하고, 삭제한 노트의 내용과 할 일은 제외한다.
  const [recent, myTasks, noteCounts, members] = await Promise.all([
    db.select({ id: notes.id, title: notes.title, spaceId: notes.spaceId, status: notes.status, updatedAt: notes.updatedAt })
      .from(notes).where(and(inArray(notes.spaceId, spaceIds), isNull(notes.deletedAt)))
      .orderBy(desc(notes.updatedAt), asc(notes.id)).limit(5),
    db.select({ task: tasks, noteTitle: notes.title }).from(tasks)
      .innerJoin(notes, and(eq(notes.id, tasks.noteId), eq(notes.spaceId, tasks.spaceId)))
      .where(and(inArray(notes.spaceId, spaceIds), isNull(notes.deletedAt), eq(tasks.assigneeId, user.id), isNull(tasks.doneAt)))
      // PostgreSQL 오름차순은 NULL을 마지막에 두므로 기한 없는 일은 뒤로 간다.
      .orderBy(asc(tasks.dueDate), asc(tasks.createdAt), asc(tasks.id)).limit(5),
    db.select({ spaceId: notes.spaceId, total: count() }).from(notes)
      .where(and(inArray(notes.spaceId, spaceIds), isNull(notes.deletedAt))).groupBy(notes.spaceId),
    db.select({ spaceId: spaceMembers.spaceId, id: users.id, name: users.name, image: users.image })
      .from(spaceMembers).innerJoin(users, eq(users.id, spaceMembers.userId))
      .where(inArray(spaceMembers.spaceId, spaceIds)).orderBy(asc(spaceMembers.joinedAt), asc(users.id)),
  ]);
  const counts = new Map(noteCounts.map((row) => [row.spaceId, row.total]));
  const kindLabels = { study: "스터디", handover: "인수인계", general: "일반" };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-5 py-8">
      <SectionHeading action={<Link href="/spaces/new" className="rounded bg-accent px-3 py-2 text-xs text-on-accent hover:opacity-90">+ 새 스페이스</Link>}>홈</SectionHeading>
      {myTasks.length > 0 && (
        <Card tone="accent">
          <CardTitle tone="accent" action={<Link href="/tasks" className="text-xs text-accent hover:underline">전체 보기</Link>}>내 할 일</CardTitle>
          <p className="px-4 pb-2 text-xs text-ink-3">기한이 지난 일과 오늘 할 일부터 최대 5개를 보여 드립니다.</p>
          <ul className="divide-y divide-line">
            {myTasks.map(({ task, noteTitle }) => (
              <TaskRow key={task.id} today={today} task={{ id: task.id, body: task.body, noteId: task.noteId, spaceId: task.spaceId, noteTitle, spaceName: spaceName.get(task.spaceId), dueDate: task.dueDate, done: false, overdue: isOverdue(task.dueDate, task.doneAt) }} />
            ))}
          </ul>
        </Card>
      )}
      <Card>
        <CardTitle>최근 노트</CardTitle>
        <ul className="divide-y divide-line">
          {recent.map((note) => (
            <li key={note.id}>
              <Link href={"/s/" + note.spaceId + "/n/" + note.id}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-ink">{note.title}</span>
                  <span className="mt-1 block truncate text-xs text-ink-3">{spaceName.get(note.spaceId)}</span>
                </span>
                <NoteStatusBadge status={note.status} />
                <span className="shrink-0 text-xs text-ink-3">{relativeTime(note.updatedAt)}</span>
              </Link>
            </li>
          ))}
          {recent.length === 0 && <li><EmptyState title="아직 노트가 없습니다" hint="아래 스페이스에서 첫 노트를 만들어 보세요." /></li>}
        </ul>
      </Card>
      <section aria-labelledby="home-spaces-heading">
        <h2 id="home-spaces-heading" className="mb-3 text-sm font-semibold text-ink">내 스페이스 <span className="text-ink-3">{spaceRows.length}</span></h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {spaceRows.map(({ space }) => {
            const people = members.filter((member) => member.spaceId === space.id);
            return (
              <li key={space.id} className="min-w-0">
                <Card className="h-full">
                  <Link href={"/s/" + space.id} className="block rounded-md p-4 transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent">
                    <p className="text-xs text-ink-3">{kindLabels[space.kind]}</p>
                    <h3 className="mt-1 truncate text-base font-semibold text-ink">{space.name}</h3>
                    <p className="mt-2 text-xs text-ink-2">노트 {counts.get(space.id) ?? 0}개 · 멤버 {people.length}명</p>
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                      <AvatarStack people={people} />
                      <span className="text-xs text-ink-3">{relativeTime(space.lastActivityAt)} 활동</span>
                    </div>
                  </Link>
                </Card>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
