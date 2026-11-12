import Link from "@/components/PendingLink";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { ArrowUpRight, ChevronRight, FileText, Folder, ListTodo, Plus } from "lucide-react";
import { assignedIssues } from "@/components/screens/assigned-issues";
import styles from "@/components/screens/Dashboard.module.css";
import { listMySpaces } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { notes, tasks } from "@/lib/db/schema";
import { personalTaskItems } from "@/lib/planner-data";
import { relativeTime, todayInSeoul } from "@/lib/utils";

export default async function HomePage() {
  const [spaceRows, user, personal, issues] = await Promise.all([
    listMySpaces(), requireUser(), personalTaskItems("open", 1), assignedIssues(),
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
  const work = [
    ...projectTasks.map(({ task }) => ({ id: task.id, title: task.body, context: names.get(task.spaceId) ?? "프로젝트", due: task.dueDate, href: `/s/${task.spaceId}/n/${task.noteId}` })),
    ...personal.items.slice(0, 3).map(item => ({ id: item.id, title: item.title, context: "개인 할 일", due: item.endDate ?? item.date, href: "/tasks" })),
    ...issues.slice(0, 3).map(({ issue, spaceName }) => ({ id: issue.id, title: issue.title, context: `${spaceName} · 이슈`, due: null, href: `/s/${issue.spaceId}?tab=issues&issue=${issue.id}#issue-${issue.id}` })),
  ].sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999")).slice(0, 3);
  const recentSpaces = [...spaceRows].sort((a, b) => b.space.lastActivityAt.getTime() - a.space.lastActivityAt.getTime()).slice(0, 2);
  const dateLabel = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "long" }).format(new Date());

  return <div className={styles.home}>
    <header className={styles.greeting}>
      <Link href="/calendar" className={styles.date}>{dateLabel}<ChevronRight size={14} /></Link>
      <h1>다시 이어가 볼까요?</h1>
      <p>기록을 이어 쓰고, 할 일을 하나씩 정리해요.</p>
    </header>
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
    <section aria-labelledby="home-work-heading" className={styles.section}>
      <div className={styles.sectionHeading}><h2 id="home-work-heading">먼저 챙길 일</h2><Link href="/tasks">전체 보기<ChevronRight size={15} /></Link></div>
      {work.length > 0 ? <ul className={styles.rows}>{work.map(item => <li key={item.id}>
        <Link href={item.href} className={styles.row}>
          <ListTodo className={styles.taskIcon} size={20} strokeWidth={1.5} />
          <span className={styles.rowText}><strong>{item.title}</strong><span>{item.context}</span></span>
          {item.due && <span className={item.due < today ? styles.overdue : styles.due}>{item.due < today ? "기한 지남" : item.due === today ? "오늘" : `${Number(item.due.slice(5, 7))}/${Number(item.due.slice(8, 10))}`}</span>}
          <ChevronRight className={styles.rowArrow} size={16} />
        </Link>
      </li>)}</ul> : <div className={styles.quiet}><ListTodo size={20} /><div><p>지금 챙길 일이 없어요</p><span>할 일이 생기면 이곳에서 바로 이어갈 수 있어요.</span></div></div>}
    </section>
    <Link href="/projects" className={styles.projectShortcut}><Folder size={19} /><span>모든 프로젝트 모아보기</span><ChevronRight size={17} /></Link>
  </div>;
}
