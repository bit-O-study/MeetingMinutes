import Link from "@/components/PendingLink";
import { and, asc, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { ArrowUpRight, ChevronRight, FileText, Folder, ListTodo, Plus } from "lucide-react";
import { assignedIssues } from "@/components/screens/assigned-issues";
import styles from "@/components/screens/Dashboard.module.css";
import { listMySpaces } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { notes, tasks, spaceMembers, users } from "@/lib/db/schema";
import { personalTaskItems, calendarItems } from "@/lib/planner-data";
import { HomeProjects } from "@/components/screens/HomeProjects";
import { HomeFocus } from "@/components/screens/HomeFocus";
import { listMyProjectFolders } from "@/lib/actions/project-folders";
import { occursOn, plannerWhen } from "@/lib/planner";
import { relativeTime, todayInSeoul } from "@/lib/utils";

export default async function HomePage() {
  const [spaceRows, user, personal, issues, folders, calendar] = await Promise.all([
    listMySpaces(), requireUser(), personalTaskItems("open", 1), assignedIssues(),
    listMyProjectFolders(), calendarItems(todayInSeoul().slice(0, 7)),
  ]);
  const spaceIds = spaceRows.map(({ space }) => space.id);
  const names = new Map(spaceRows.map(({ space }) => [space.id, space.name]));
  // 홈에서도 권한 범위를 먼저 정하고, 프로젝트가 없으면 문서를 조회하지 않는다.
  const recent = spaceIds.length ? await db.select({ id: notes.id, title: notes.title, spaceId: notes.spaceId, updatedAt: notes.updatedAt })
    .from(notes).where(and(inArray(notes.spaceId, spaceIds), isNull(notes.deletedAt)))
    .orderBy(desc(notes.updatedAt), asc(notes.id)).limit(2) : [];
  const projectTasks = spaceIds.length ? await db.select({ task: tasks }).from(tasks)
    .innerJoin(notes, and(eq(notes.id, tasks.noteId), eq(notes.spaceId, tasks.spaceId)))
    .where(and(inArray(notes.spaceId, spaceIds), isNull(notes.deletedAt), eq(tasks.assigneeId, user.id), isNull(tasks.doneAt)))
    .orderBy(asc(tasks.dueDate), asc(tasks.createdAt), asc(tasks.id)).limit(3) : [];
  const today = todayInSeoul();
  const [counts, members] = spaceIds.length ? await Promise.all([
    db.select({ spaceId: notes.spaceId, total: count() }).from(notes).where(and(inArray(notes.spaceId, spaceIds), isNull(notes.deletedAt))).groupBy(notes.spaceId),
    db.select({ spaceId: spaceMembers.spaceId, id: users.id, name: users.name, image: users.image }).from(spaceMembers).innerJoin(users, eq(users.id, spaceMembers.userId)).where(inArray(spaceMembers.spaceId, spaceIds)).orderBy(asc(spaceMembers.joinedAt), asc(users.id)),
  ]) : [[], []];
  const noteCounts = new Map(counts.map(row => [row.spaceId, row.total]));
  const kindLabels = { study: "스터디", handover: "인수인계", general: "일반" };
  const agenda = calendar.filter(item => occursOn(item, today) && !item.done);
  const focus = [
    ...projectTasks.map(({ task }) => ({ id: task.id, title: task.body, context: names.get(task.spaceId) ?? "프로젝트", due: task.dueDate, href: `/s/${task.spaceId}/n/${task.noteId}` })),
    ...personal.items.slice(0, 5).map(item => ({ id: item.id, title: item.title, context: "개인 할 일", due: item.endDate ?? item.date, href: "/tasks", version: item.version })),
  ].sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999")).slice(0, 5);
  const work = issues.slice(0, 3).map(({ issue, spaceName }) => ({ id: issue.id, title: issue.title, context: spaceName, due: null as string | null, href: `/s/${issue.spaceId}?tab=issues&issue=${issue.id}#issue-${issue.id}` }));
  const recentSpaces = [...spaceRows].sort((a, b) => b.space.lastActivityAt.getTime() - a.space.lastActivityAt.getTime()).slice(0, 2);
  const dateLabel = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "long" }).format(new Date());

  return <div className={styles.home}>
    <header className={styles.greeting}>
      <div><Link href="/calendar" className={styles.date}>{dateLabel}<ChevronRight size={14} /></Link>
      <h1>함께 쌓아가는 기록</h1>
      <p>프로젝트별로 모으고, 작은 이야기부터 이어가세요.</p></div>
      <Link href="/spaces/new" className={styles.primary}><Plus size={16} />새 프로젝트</Link>
    </header>
    <div className={styles.overview}>
      <HomeFocus items={focus} today={today} />
      <section className={styles.agenda} aria-label="오늘의 일정">
        <div className={styles.sectionHeading}><h2>오늘의 일정</h2><Link href="/calendar">개인 일정 →</Link></div>
        <p className="mb-3 text-xs text-ink-3">일정 {agenda.length}개 · 오늘 할 일을 챙겨요</p>
        {agenda.length ? agenda.slice(0, 3).map(item => <Link href={`/calendar?day=${today}`} key={item.id} className={styles.agendaItem}><small>{plannerWhen(item)}</small><strong>{item.title}</strong></Link>) : <p className="py-5 text-xs leading-6 text-ink-2">등록된 일정이 없어요.<br />여유 있는 하루를 계획해 보세요.</p>}
        <Link href="/calendar" className={styles.agendaMore}>일정 살펴보기 →</Link>
      </section>
    </div>
    <section aria-labelledby="home-work-heading" className={styles.section}>
      <div className={styles.sectionHeading}><h2 id="home-work-heading">내 할 일 · 담당 이슈 {issues.length}개</h2><Link href="/tasks">전체 보기<ChevronRight size={15} /></Link></div>
      {work.length > 0 ? <ul className={styles.rows}>{work.map(item => <li key={item.id}>
        <Link href={item.href} className={styles.row}>
          <ListTodo className={styles.taskIcon} size={20} strokeWidth={1.5} />
          <span className={styles.rowText}><strong>{item.title}</strong><span>{item.context}</span></span>
          {item.due && <span className={item.due < today ? styles.overdue : styles.due}>{item.due < today ? "기한 지남" : item.due === today ? "오늘" : `${Number(item.due.slice(5, 7))}/${Number(item.due.slice(8, 10))}`}</span>}
          <ChevronRight className={styles.rowArrow} size={16} />
        </Link>
      </li>)}</ul> : <div className={styles.quiet}><ListTodo size={20} /><div><p>지금 챙길 일이 없어요</p><span>할 일이 생기면 이곳에서 바로 이어갈 수 있어요.</span></div></div>}
    </section>
    <section className={styles.section} aria-labelledby="projects-heading">
      <div className={styles.sectionHeading}><div><h2 id="projects-heading">내 프로젝트</h2><p className="mt-1 text-xs text-ink-3">프로젝트를 누르면 함께 쌓은 기록이 열려요.</p></div><Link href="/projects">전체 보기 →</Link></div>
      <HomeProjects userId={user.id} initial={folders} projects={[...spaceRows].sort((a,b)=>b.space.lastActivityAt.getTime()-a.space.lastActivityAt.getTime()).map(({space})=>({id:space.id,name:space.name,kindLabel:kindLabels[space.kind],noteCount:noteCounts.get(space.id)??0,activityLabel:relativeTime(space.lastActivityAt),people:members.filter(member=>member.spaceId===space.id)}))} />
    </section>
    <section aria-labelledby="resume-heading" className={styles.section}>
      <div className={styles.sectionHeading}><h2 id="resume-heading">이어서 작업하기</h2><Link href="/projects">프로젝트 보기<ChevronRight size={15} /></Link></div>
      {recent.length > 0 ? <ul className={styles.rows}>{recent.map(note => <li key={note.id}>
        <Link href={`/s/${note.spaceId}/n/${note.id}`} className={styles.row}>
          <span className={styles.documentIcon}><FileText size={21} strokeWidth={1.6} /></span>
          <span className={styles.rowText}><strong>{note.title}</strong><span>{names.get(note.spaceId)} · {relativeTime(note.updatedAt)}</span></span>
          <ArrowUpRight className={styles.rowArrow} size={17} />
        </Link>
      </li>)}</ul> : recentSpaces.length > 0 ? <ul className={styles.rows}>{recentSpaces.map(({ space }) => <li key={space.id}>
        <Link href={`/s/${space.id}`} className={styles.row}><span className={styles.documentIcon}><Folder size={21} strokeWidth={1.6} /></span><span className={styles.rowText}><strong>{space.name}</strong><span>프로젝트에서 첫 기록을 시작해 보세요</span></span><ArrowUpRight className={styles.rowArrow} size={17} /></Link>
      </li>)}</ul> : <div className={styles.welcome}><span className={styles.documentIcon}><Folder size={24} /></span><h3>함께할 공간부터 만들어 보세요</h3><p>스터디도, 팀의 회의도 프로젝트 하나로 시작해요.</p><Link href="/spaces/new" className={styles.primary}><Plus size={17} />첫 프로젝트 만들기</Link></div>}
    </section>
  </div>;
}
