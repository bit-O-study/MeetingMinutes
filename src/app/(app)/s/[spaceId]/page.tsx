/**
 * S-02 스페이스 · CODEX
 * 스페이스 권한을 먼저 확인하고 선택한 탭만 조회한다.
 */
import Link from "next/link";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { Badge, NoteStatusBadge } from "@/components/ui/Badge";
import { Card, EmptyState, SectionHeading } from "@/components/ui/Panels";
import { TaskRow } from "@/components/screens/TaskRow";
import { AvatarStack } from "@/components/ui/Avatar";
import { SpaceOwnerPanel } from "@/components/screens/SpaceOwnerPanel";
import { listSpaceMembers } from "@/lib/actions/spaces";
import { SpaceMembers } from "@/components/screens/SpaceMembers";
import { openQuestionCounts } from "@/lib/actions/search";
import { requireSpaceMember } from "@/lib/access";
import { db } from "@/lib/db";
import { notes, tasks, users } from "@/lib/db/schema";
import { cn, isOverdue, relativeTime, todayInSeoul } from "@/lib/utils";

export default async function SpacePage({ params, searchParams }: PageProps<"/s/[spaceId]">) {
  const { spaceId } = await params;
  const { space, role, userId } = await requireSpaceMember(spaceId);
  const query = await searchParams;
  const tab = query.tab === "tasks" || query.tab === "members" ? query.tab : "notes";
  const today = todayInSeoul();
  const members = await listSpaceMembers(spaceId);
  const questionCounts = tab === "notes" ? await openQuestionCounts(spaceId) : {};
  const noteRows = tab === "notes" ? await db
    .select({ id: notes.id, title: notes.title, status: notes.status, updatedAt: notes.updatedAt, updatedByName: users.name })
    .from(notes).leftJoin(users, eq(users.id, notes.updatedBy))
    .where(and(eq(notes.spaceId, spaceId), isNull(notes.deletedAt)))
    .orderBy(desc(notes.updatedAt), asc(notes.id)) : [];
  const taskRows = tab === "tasks" ? await db
    .select({ task: tasks, noteTitle: notes.title, assigneeName: users.name })
    .from(tasks)
    .innerJoin(notes, and(eq(notes.id, tasks.noteId), eq(notes.spaceId, tasks.spaceId)))
    .leftJoin(users, eq(users.id, tasks.assigneeId))
    .where(and(eq(notes.spaceId, spaceId), isNull(notes.deletedAt)))
    .orderBy(asc(tasks.dueDate), asc(tasks.createdAt), asc(tasks.id)) : [];
  const taskGroups = [
    { title: "미완료", rows: taskRows.filter((row) => !row.task.doneAt) },
    { title: "완료", rows: taskRows.filter((row) => row.task.doneAt) },
  ];
  const kindLabels = { study: "스터디", handover: "인수인계", general: "일반" };
  const tabs = [{ value: "notes", label: "노트" }, { value: "tasks", label: "할 일" }, { value: "members", label: "멤버" }];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-5 py-8">
      <SectionHeading action={<Link href={"/s/" + spaceId + "/new"} className="rounded bg-accent px-3 py-2 text-xs text-on-accent hover:opacity-90">+ 새 노트</Link>}>
        <span className="break-all">{space.name}</span>
      </SectionHeading>
      <div className="flex flex-wrap items-center gap-2">
        <Badge>{kindLabels[space.kind]}</Badge>
        <span className="text-xs text-ink-3">멤버 모두가 노트와 할 일을 함께 편집할 수 있습니다.</span>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <AvatarStack people={members} />
        <span className="text-xs text-ink-3">멤버 {members.length}명</span>
        {role === "owner" && <Link href={"/s/" + spaceId + "?tab=members"} className="ml-auto text-xs text-accent hover:underline">+ 멤버 초대</Link>}
      </div>
      {role === "owner" && <SpaceOwnerPanel key={space.name} spaceId={spaceId} name={space.name} />}
      <nav aria-label="스페이스 메뉴" className="flex gap-2 border-b border-line pb-3">
        {tabs.map((item) => (
          <Link key={item.value} href={"/s/" + spaceId + "?tab=" + item.value}
            aria-current={tab === item.value ? "page" : undefined}
            className={cn("rounded px-4 py-2 text-sm focus-visible:outline-2 focus-visible:outline-accent",
              tab === item.value ? "bg-accent-soft text-accent" : "text-ink-2 hover:bg-surface-2")}>{item.label}</Link>
        ))}
      </nav>
      {tab === "notes" && (
        <Card>
          <ul className="divide-y divide-line">
            {noteRows.map((note) => (
              <li key={note.id}>
                <Link href={"/s/" + spaceId + "/n/" + note.id} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-ink">{note.title}</span>
                    <span className="mt-1 block text-xs text-ink-3">{note.updatedByName ?? "이름 없음"} · {relativeTime(note.updatedAt)} 수정</span>
                  </span>
                  {questionCounts[note.id] > 0 && <Badge tone="accent">미해결 질문 {questionCounts[note.id]}</Badge>}
                  <NoteStatusBadge status={note.status} />
                </Link>
              </li>
            ))}
            {noteRows.length === 0 && <li><EmptyState title="첫 노트를 만들어 보세요" hint="스터디 회의록, 인수인계 메모, 빈 노트로 시작할 수 있습니다." action={{ href: "/s/" + spaceId + "/new", label: "새 노트" }} /></li>}
          </ul>
        </Card>
      )}
      {tab === "tasks" && (
        <>
          <p className="text-xs text-ink-3">담당자가 없는 공용 할 일도 함께 표시합니다.</p>
          {taskGroups.filter((group) => group.rows.length > 0).map((group) => (
            <section key={group.title} aria-label={group.title}>
              <h2 className="mb-2 text-sm font-semibold text-ink">{group.title} · {group.rows.length}</h2>
              <Card><ul className="divide-y divide-line">
                {group.rows.map(({ task, noteTitle, assigneeName }) => (
                  <TaskRow key={task.id} today={today} task={{
                    id: task.id, body: task.body, noteId: task.noteId, spaceId, noteTitle,
                    spaceName: task.assigneeId ? assigneeName ?? "이름 없음" : "공용",
                    dueDate: task.dueDate, done: Boolean(task.doneAt), overdue: isOverdue(task.dueDate, task.doneAt),
                  }} />
                ))}
              </ul></Card>
            </section>
          ))}
          {taskRows.length === 0 && <Card><EmptyState title="아직 할 일이 없습니다" hint="노트에 적은 할 일을 이곳에서 함께 관리합니다." action={{ href: "/s/" + spaceId + "?tab=notes", label: "노트 보기" }} /></Card>}
        </>
      )}
      {tab === "members" && <SpaceMembers spaceId={spaceId} role={role} userId={userId} members={members} />}
    </div>
  );
}
