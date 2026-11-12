/**
 * S-01 홈 · CODEX
 * 할 일은 먼저 알려 주고, 노트와 스페이스는 이어서 찾아갈 수 있게 한다.
 */
import Link from "@/components/PendingLink";
import { and, asc, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { ChevronRight, Plus } from "lucide-react";
import { Card, EmptyState, SectionHeading } from "@/components/ui/Panels";
import { NoteStatusBadge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { HomeProjects } from "@/components/screens/HomeProjects";
import { listMyProjectFolders } from "@/lib/actions/project-folders";
import { AssignedIssueRow } from "@/components/screens/AssignedIssueRow";
import { assignedIssues } from "@/components/screens/assigned-issues";
import { PersonalPlannerHome } from "@/components/screens/PersonalPlannerHome";
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
        <PersonalPlannerHome />
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
  const myIssues = await assignedIssues();
  const folderData = await listMyProjectFolders();
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
    <div className="workspace-page home-page">
      <div className="page-heading">
        <div className="min-w-0 flex-1"><p className="page-eyebrow">내 작업 공간</p>
        <h1 className="page-title">
          {user.name ? `안녕하세요, ${user.name} 님` : "홈"}
        </h1>
        <p className="page-description">오늘의 할 일부터 팀의 기록까지, 한곳에서 이어가세요.</p></div>
        <ButtonLink href="/spaces/new" size="sm" className="hidden sm:inline-flex"><Plus className="size-4" />새 프로젝트</ButtonLink>
      </div>

      <PersonalPlannerHome />
      {myTasks.length > 0 && (
        <section className="home-tasks ui-card p-5">
          <div className="relative flex items-center gap-2">
            <h2 className="text-base font-semibold">내 할 일 {myTasks.length}개</h2>
            {overdueCount > 0 && <span className="rounded-md bg-warn-soft px-2.5 py-1 text-xs font-medium text-warn">{overdueCount}개 기한 지남</span>}
            <Link href="/tasks" className="ml-auto inline-flex items-center text-sm font-bold opacity-90 hover:opacity-100">전체 <ChevronRight className="size-4" /></Link>
          </div>
          <ul className="relative mt-3 flex flex-col gap-1.5">
            {myTasks.map(({ task, noteTitle }) => (
              <li key={task.id}>
                <Link href={`/s/${task.spaceId}/n/${task.noteId}`} className="flex items-center gap-2 rounded-lg px-2 py-3 text-sm hover:bg-surface-2">
                  <span className="size-3 flex-none rounded border border-line-2" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate font-semibold">{task.body}</span>
                  <span className="hidden max-w-[40%] truncate text-xs opacity-80 sm:inline">{spaceName.get(task.spaceId)} · {noteTitle}</span>
                  <span className="flex-none text-xs font-bold opacity-90">{dueText(task.dueDate, task.doneAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {myIssues.length > 0 && <Card>
        <div className="flex items-center justify-between gap-2 px-3 pt-3">
          <h2 className="text-sm font-bold text-ink">내 할 일 · 담당 이슈 {myIssues.length}개</h2>
          <Link href="/tasks" className="text-sm font-bold text-accent">전체 보기</Link>
        </div>
        <ul className="divide-y divide-line">{myIssues.slice(0, 5).map(row => <AssignedIssueRow key={row.issue.id} {...row} />)}</ul>
      </Card>}

      <HomeProjects key={user.id} userId={user.id} initial={folderData} projects={sortedSpaceRows.map(({ space }) => ({
        id: space.id,
        name: space.name,
        kindLabel: kindLabels[space.kind],
        noteCount: counts.get(space.id) ?? 0,
        activityLabel: relativeTime(space.lastActivityAt),
        people: members.filter(member => member.spaceId === space.id).map(({ id, name, image }) => ({ id, name, image })),
      }))} />

      <section aria-labelledby="home-recent-heading" className="flex flex-col gap-3">
        <h2 id="home-recent-heading" className="px-1 text-lg font-semibold tracking-tight text-ink">최근 노트</h2>
        {recent.length === 0 ? (
          <Card><EmptyState title="아직 노트가 없어요" hint="프로젝트에서 첫 노트를 만들어 보세요." /></Card>
        ) : (
          <ul className="recent-notes">
            {recent.map((note) => (
              <li key={note.id}>
                <Link href={"/s/" + note.spaceId + "/n/" + note.id}
                  className="recent-note flex items-center gap-3 px-4 py-4 focus-visible:outline-2 focus-visible:outline-accent">
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
