import { ProjectChat } from "@/components/screens/ProjectChat";
import { IssuePanel } from "@/components/screens/IssuePanel";
import { listProjectMessages } from "@/lib/actions/project-chat";
import { listIssues } from "@/lib/actions/issues";
import { ISSUE_STATUSES } from "@/lib/issue-input";
/**
 * S-02 스페이스 · CODEX
 * 스페이스 권한을 먼저 확인하고 선택한 탭만 조회한다.
 */
import Link from "@/components/PendingLink";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { Badge, NoteStatusBadge } from "@/components/ui/Badge";
import { Card, EmptyState } from "@/components/ui/Panels";
import { ProjectIcon } from "@/components/ui/ProjectIcon";
import { PROJECT_SCOPE_CLASS, projectColor } from "@/components/ui/projectColor";
import { buttonClass } from "@/components/ui/Button";
import { Plus, Settings } from "lucide-react";
import { TaskRow } from "@/components/screens/TaskRow";
import { AvatarStack } from "@/components/ui/Avatar";
import { SpaceOwnerPanel } from "@/components/screens/SpaceOwnerPanel";
import { listSpaceMembers } from "@/lib/actions/spaces";
import { SpaceMembers } from "@/components/screens/SpaceMembers";
import { openQuestionCounts } from "@/lib/actions/search";
import { requireSpaceMember } from "@/lib/access";
import { db } from "@/lib/db";
import { notes, tasks, users } from "@/lib/db/schema";
import { sql } from "drizzle-orm";
import { cn, isOverdue, relativeTime, todayInSeoul } from "@/lib/utils";

export default async function SpacePage({ params, searchParams }: PageProps<"/s/[spaceId]">) {
  const { spaceId } = await params;
  const { space, role, userId } = await requireSpaceMember(spaceId);
  const query = await searchParams;
  const tab = query.tab === "notes" || query.tab === "chat" || query.tab === "tasks" || query.tab === "members" || query.tab === "issues" ? query.tab : "chat";
  const today = todayInSeoul();
  const requestedPage = Number(query.page ?? 1);
  const notePage = Number.isSafeInteger(requestedPage) ? Math.max(1, Math.min(10000, requestedPage)) : 1;
  const status = query.status === "raw" || query.status === "open" || query.status === "in_progress" || query.status === "closed" ? query.status : undefined;
  const [members, questionCounts, noteRows, taskRows, issueList, chatList] = await Promise.all([
    listSpaceMembers(spaceId),
    tab === "notes" ? openQuestionCounts(spaceId, notePage) : {} as Record<string, number>,
    tab === "notes" ? db
    // 카드 미리보기용 본문 앞부분(재디자인) — 전체 본문을 읽지 않게 DB 에서 자른다.
    .select({ id: notes.id, title: notes.title, status: notes.status, updatedAt: notes.updatedAt, updatedByName: users.name, excerpt: sql<string>`left(${notes.plainText}, 140)` })
    .from(notes).leftJoin(users, eq(users.id, notes.updatedBy))
    .where(and(eq(notes.spaceId, spaceId), isNull(notes.deletedAt)))
    .orderBy(desc(notes.updatedAt), asc(notes.id)).limit(31).offset((notePage - 1) * 30) : [],
    tab === "tasks" ? db
    .select({ task: tasks, noteTitle: notes.title, assigneeName: users.name })
    .from(tasks)
    .innerJoin(notes, and(eq(notes.id, tasks.noteId), eq(notes.spaceId, tasks.spaceId)))
    .leftJoin(users, eq(users.id, tasks.assigneeId))
    .where(and(eq(notes.spaceId, spaceId), isNull(notes.deletedAt)))
    .orderBy(asc(tasks.dueDate), asc(tasks.createdAt), asc(tasks.id)) : [],
    tab === "issues" ? listIssues(spaceId, status, Number(query.page ?? 1)) : null,
    tab === "chat" ? listProjectMessages(spaceId, Number(query.page ?? 1)) : null,
  ]);
  const taskGroups = [
    { title: "미완료", rows: taskRows.filter((row) => !row.task.doneAt) },
    { title: "완료", rows: taskRows.filter((row) => row.task.doneAt) },
  ];
  const kindLabels = { study: "스터디", handover: "인수인계", general: "일반" };
  const tabs = [{ value: "chat", label: "대화" }, { value: "notes", label: "노트" }, { value: "tasks", label: "할 일" }, { value: "issues", label: "이슈" }, { value: "members", label: role === "owner" ? "멤버·설정" : "멤버" }];
  const color = projectColor(spaceId);

  // 재디자인(2026-10-14): 프로젝트 색 머리글 + 붙어 있는 밑줄 탭. 화면 전체를 project-* 로 감싸
  // 버튼·탭·내 말풍선·체크가 그 프로젝트 색을 따른다. 설정은 머리글이 아니라 멤버·설정 탭으로 옮겼다.
  return (
    <div className={cn("mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-5 md:px-6 md:py-7", PROJECT_SCOPE_CLASS[color])}>
      <header className="relative overflow-hidden rounded-3xl bg-accent p-5 text-on-accent shadow-float">
        <div aria-hidden="true" className="pointer-events-none absolute -top-12 -right-10 size-40 rounded-full bg-white/10" />
        <div className="relative flex items-center gap-3">
          <ProjectIcon spaceId={spaceId} name={space.name} size="lg" className="bg-white/20" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-black tracking-tight md:text-2xl">{space.name}</h1>
            <p className="mt-0.5 text-[13px] opacity-90">{kindLabels[space.kind]} · 멤버 {members.length}명</p>
          </div>
          <div className="hidden sm:block"><AvatarStack people={members} /></div>
        </div>
        <div className="relative mt-4 flex flex-wrap gap-2">
          <Link href={"/s/" + spaceId + "/new"} className="press inline-flex h-10 items-center gap-1.5 rounded-2xl bg-white px-4 text-sm font-extrabold text-accent">
            <Plus className="size-4" />새 노트
          </Link>
          {role === "owner" && (
            <Link href={"/s/" + spaceId + "?tab=members"} className="press inline-flex h-10 items-center gap-1.5 rounded-2xl bg-white/15 px-4 text-sm font-bold">
              <Settings className="size-4" />멤버 초대·설정
            </Link>
          )}
        </div>
      </header>

      <nav aria-label="프로젝트 메뉴" className="sticky top-[calc(var(--safe-top)+45px)] z-10 -mx-4 flex gap-1 overflow-x-auto border-b border-line bg-ground/95 px-4 backdrop-blur md:-mx-6 md:px-6">
        {tabs.map((item) => (
          <Link key={item.value} href={"/s/" + spaceId + "?tab=" + item.value}
            aria-current={tab === item.value ? "page" : undefined}
            className={cn("relative px-3 py-3 text-sm font-extrabold whitespace-nowrap focus-visible:outline-2 focus-visible:outline-accent",
              tab === item.value ? "text-ink after:absolute after:inset-x-2 after:-bottom-px after:h-[3px] after:rounded-full after:bg-accent" : "text-ink-3 hover:text-ink-2")}>{item.label}</Link>
        ))}
      </nav>

      {tab === "chat" && chatList && <ProjectChat spaceId={spaceId} userId={userId} members={members} rows={chatList.rows} total={chatList.total} page={chatList.page} />}

      {tab === "notes" && (
        noteRows.length === 0 ? (
          <Card><EmptyState title="첫 노트를 만들어 보세요" hint="스터디 회의록, 인수인계 메모, 빈 노트로 시작할 수 있어요." action={{ href: "/s/" + spaceId + "/new", label: "새 노트" }} /></Card>
        ) : (
          <ul className="flex flex-col gap-2">
            {noteRows.slice(0, 30).map((note) => (
              <li key={note.id}>
                <Link href={"/s/" + spaceId + "/n/" + note.id} className="press flex flex-col gap-1.5 rounded-2xl bg-surface px-4 py-3.5 transition-shadow hover:shadow-float focus-visible:outline-2 focus-visible:outline-accent">
                  <span className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[15px] font-extrabold text-ink">{note.title}</span>
                    {questionCounts[note.id] > 0 && <Badge tone="warn">질문 {questionCounts[note.id]}</Badge>}
                    <NoteStatusBadge status={note.status} />
                  </span>
                  {note.excerpt?.trim() && <span className="line-clamp-2 text-[13px] leading-relaxed text-ink-2">{note.excerpt}</span>}
                  <span className="text-xs text-ink-3">{note.updatedByName ?? "이름 없음"} · {relativeTime(note.updatedAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )
      )}

      {tab === "notes" && <nav aria-label="노트 페이지" className="flex gap-3">{notePage > 1 && <Link href={`/s/${spaceId}?tab=notes&page=${notePage - 1}`} className={buttonClass("ghost", "sm")}>이전</Link>}{noteRows.length > 30 && <Link href={`/s/${spaceId}?tab=notes&page=${notePage + 1}`} className={buttonClass("ghost", "sm")}>다음</Link>}</nav>}

      {tab === "tasks" && (
        <>
          {taskGroups.filter((group) => group.rows.length > 0).map((group) => (
            <section key={group.title} aria-label={group.title} className="flex flex-col gap-2">
              <h2 className="px-1 text-sm font-extrabold text-ink">{group.title} <span className="font-semibold text-ink-3">{group.rows.length}</span></h2>
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
          {taskRows.length === 0 && <Card><EmptyState title="아직 할 일이 없어요" hint="노트에 체크 목록을 쓰면 여기에 모여요." action={{ href: "/s/" + spaceId + "?tab=notes", label: "노트 보기" }} /></Card>}
        </>
      )}

      {tab === "issues" && issueList && <>
        <div className="flex flex-wrap items-center gap-2">
          <nav aria-label="이슈 상태" className="flex flex-wrap gap-1.5">
            <Link href={"/s/" + spaceId + "?tab=issues"} aria-current={!status ? "page" : undefined}
              className={cn("press inline-flex h-9 items-center rounded-full px-3.5 text-[13px] font-bold", !status ? "bg-accent text-on-accent" : "bg-surface text-ink-2")}>전체</Link>
            {Object.entries(ISSUE_STATUSES).map(([value, label]) => (
              <Link key={value} aria-current={status === value ? "page" : undefined} href={"/s/" + spaceId + "?tab=issues&status=" + value}
                className={cn("press inline-flex h-9 items-center rounded-full px-3.5 text-[13px] font-bold", status === value ? "bg-accent text-on-accent" : "bg-surface text-ink-2")}>{label}</Link>
            ))}
          </nav>
          <span className="ml-auto text-sm text-ink-3">{issueList.total}개</span>
        </div>
        <IssuePanel spaceId={spaceId} members={members} rows={issueList.rows} />
        <nav aria-label="이슈 페이지" className="flex gap-2">
          {issueList.page > 1 && <Link className={buttonClass("ghost", "sm")} href={"/s/" + spaceId + "?tab=issues&status=" + (status ?? "") + "&page=" + (issueList.page - 1)}>이전</Link>}
          {issueList.page * 30 < issueList.total && <Link className={buttonClass("ghost", "sm")} href={"/s/" + spaceId + "?tab=issues&status=" + (status ?? "") + "&page=" + (issueList.page + 1)}>다음</Link>}
        </nav>
      </>}

      {tab === "members" && (
        <>
          <SpaceMembers spaceId={spaceId} role={role} userId={userId} members={members} />
          {role === "owner" && <SpaceOwnerPanel key={space.name} spaceId={spaceId} name={space.name} />}
        </>
      )}
    </div>
  );
}
