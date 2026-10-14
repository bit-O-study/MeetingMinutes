/**
 * S-01 홈 · CODEX
 * 할 일은 먼저 알려 주고, 노트와 스페이스는 이어서 찾아갈 수 있게 한다.
 */
import Link from "next/link";
import { and, asc, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { ChevronRight, Plus } from "lucide-react";
import { Card, EmptyState, SectionHeading } from "@/components/ui/Panels";
import { NoteStatusBadge } from "@/components/ui/Badge";
import { AvatarStack } from "@/components/ui/Avatar";
import { ButtonLink } from "@/components/ui/Button";
import { ProjectIcon } from "@/components/ui/ProjectIcon";
import { PROJECT_BG_CLASS, projectColor } from "@/components/ui/projectColor";
import { listMySpaces } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { notes, spaceMembers, tasks, users } from "@/lib/db/schema";
import { isOverdue, relativeTime, todayInSeoul } from "@/lib/utils";

export default async function HomePage() {
  const spaceRows = await listMySpaces();
  const sortedSpaceRows = [...spaceRows].sort((a, b) => b.space.lastActivityAt.getTime() - a.space.lastActivityAt.getTime());
  const spaceIds = spaceRows.map((row) => row.space.id);
  const spaceName = new Map(spaceRows.map((row) => [row.space.id, row.space.name]));

  if (spaceIds.length === 0) {
    return (
      <div className="mx-auto w-full max-w-3xl px-5 py-8">
        <SectionHeading>홈</SectionHeading>
        <Card>
          <EmptyState title="첫 프로젝트를 만들어 보세요"
            hint="스터디 회차를 모아 두거나, 인수인계 메모를 함께 정리할 공간이에요."
            action={{ href: "/spaces/new", label: "새 프로젝트" }} />
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

  const overdueCount = myTasks.filter(({ task }) => isOverdue(task.dueDate, task.doneAt)).length;
  const dueText = (dueDate: string | null, doneAt: Date | null) => {
    if (!dueDate) return "기한 없음";
    if (isOverdue(dueDate, doneAt)) return "지난 기한";
    if (dueDate === today) return "오늘";
    const [, m, d] = dueDate.split("-");
    return `${Number(m)}/${Number(d)}`;
  };

  // 재디자인(2026-10-14): 오늘 할 일은 맨 위 강조 카드, 프로젝트는 색 타일, 최근 노트는 프로젝트 색 점이 붙은 카드.
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
      <div className="flex items-center gap-3">
        <h1 className="flex-1 text-2xl font-black tracking-tight text-ink">
          {user.name ? `안녕하세요, ${user.name} 님` : "홈"}
        </h1>
        <ButtonLink href="/spaces/new" size="sm" className="hidden sm:inline-flex"><Plus className="size-4" />새 프로젝트</ButtonLink>
      </div>

      {myTasks.length > 0 && (
        <section className="relative overflow-hidden rounded-3xl bg-accent p-5 text-on-accent shadow-float">
          {/* 장식 원 — 카드가 평평한 상자로 보이지 않게. 읽는 내용은 없다. */}
          <div aria-hidden="true" className="pointer-events-none absolute -top-10 -right-10 size-36 rounded-full bg-white/10" />
          <div className="relative flex items-center gap-2">
            <h2 className="text-lg font-extrabold">내 할 일 {myTasks.length}개</h2>
            {overdueCount > 0 && <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-bold">{overdueCount}개 기한 지남</span>}
            <Link href="/tasks" className="ml-auto inline-flex items-center text-sm font-bold opacity-90 hover:opacity-100">전체 <ChevronRight className="size-4" /></Link>
          </div>
          <ul className="relative mt-3 flex flex-col gap-1.5">
            {myTasks.map(({ task, noteTitle }) => (
              <li key={task.id}>
                <Link href={`/s/${task.spaceId}/n/${task.noteId}`} className="flex items-center gap-2 rounded-xl bg-white/12 px-3 py-2 text-sm hover:bg-white/20">
                  <span className="size-4 flex-none rounded-md ring-2 ring-white/70 ring-inset" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate font-semibold">{task.body}</span>
                  <span className="hidden max-w-[40%] truncate text-xs opacity-80 sm:inline">{spaceName.get(task.spaceId)} · {noteTitle}</span>
                  <span className="flex-none text-xs font-bold opacity-90">{dueText(task.dueDate, task.doneAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="home-spaces-heading" className="flex flex-col gap-3">
        <div className="flex items-baseline gap-2 px-1">
          <h2 id="home-spaces-heading" className="text-[15px] font-extrabold text-ink">내 프로젝트</h2>
          <span className="text-sm text-ink-3">{spaceRows.length}</span>
        </div>
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {sortedSpaceRows.map(({ space }) => {
            const people = members.filter((member) => member.spaceId === space.id);
            return (
              <li key={space.id} className="min-w-0">
                <Link href={"/s/" + space.id}
                  className="press flex h-full flex-col gap-3 rounded-2xl bg-surface p-4 transition-shadow hover:shadow-float focus-visible:outline-2 focus-visible:outline-accent">
                  <div className="flex items-start justify-between gap-2">
                    <ProjectIcon spaceId={space.id} name={space.name} />
                    <span className="text-xs font-semibold text-ink-3">{kindLabels[space.kind]}</span>
                  </div>
                  <h3 className="truncate text-base font-extrabold text-ink">{space.name}</h3>
                  <div className="mt-auto flex items-center justify-between gap-2">
                    <AvatarStack people={people} />
                    <span className="truncate text-xs text-ink-3">노트 {counts.get(space.id) ?? 0} · {relativeTime(space.lastActivityAt)}</span>
                  </div>
                </Link>
              </li>
            );
          })}
          <li className="min-w-0">
            <Link href="/spaces/new" className="press flex h-full min-h-32 flex-col items-center justify-center gap-1 rounded-2xl text-sm font-bold text-ink-3 border-2 border-dashed border-line hover:text-ink-2">
              <Plus className="size-5" />새 프로젝트
            </Link>
          </li>
        </ul>
      </section>

      <section aria-labelledby="home-recent-heading" className="flex flex-col gap-3">
        <h2 id="home-recent-heading" className="px-1 text-[15px] font-extrabold text-ink">최근 노트</h2>
        {recent.length === 0 ? (
          <Card><EmptyState title="아직 노트가 없어요" hint="프로젝트에서 첫 노트를 만들어 보세요." /></Card>
        ) : (
          <ul className="flex flex-col gap-2">
            {recent.map((note) => (
              <li key={note.id}>
                <Link href={"/s/" + note.spaceId + "/n/" + note.id}
                  className="press flex items-center gap-3 rounded-2xl bg-surface px-4 py-3 transition-shadow hover:shadow-float focus-visible:outline-2 focus-visible:outline-accent">
                  <span aria-hidden="true" className={`size-2.5 flex-none rounded ${PROJECT_BG_CLASS[projectColor(note.spaceId)]}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-ink">{note.title}</span>
                    <span className="mt-0.5 block truncate text-xs text-ink-3">{spaceName.get(note.spaceId)} · {relativeTime(note.updatedAt)}</span>
                  </span>
                  <NoteStatusBadge status={note.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
