import Link from "@/components/PendingLink";
import { and, asc, count, eq, inArray, isNull } from "drizzle-orm";
import { Plus } from "lucide-react";
import { HomeProjects } from "@/components/screens/HomeProjects";
import styles from "@/components/screens/Home.module.css";
import { listMyProjectFolders } from "@/lib/actions/project-folders";
import { listMySpaces } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { notes, spaceMembers, users } from "@/lib/db/schema";
import { relativeTime } from "@/lib/utils";

export default async function ProjectsPage() {
  const [rows, user, folders] = await Promise.all([listMySpaces(), requireUser(), listMyProjectFolders()]);
  const ids = rows.map(({ space }) => space.id);
  const [counts, members] = ids.length ? await Promise.all([
    db.select({ spaceId: notes.spaceId, total: count() }).from(notes).where(and(inArray(notes.spaceId, ids), isNull(notes.deletedAt))).groupBy(notes.spaceId),
    db.select({ spaceId: spaceMembers.spaceId, id: users.id, name: users.name, image: users.image }).from(spaceMembers).innerJoin(users, eq(users.id, spaceMembers.userId)).where(inArray(spaceMembers.spaceId, ids)).orderBy(asc(spaceMembers.joinedAt), asc(users.id)),
  ]) : [[], []];
  const noteCounts = new Map(counts.map(row => [row.spaceId, row.total]));
  const labels = { study: "스터디", handover: "인수인계", general: "일반" };
  return <div className={`workspace-page ${styles.home}`}>
    <header className="flex items-center justify-between gap-3"><div><h1 className="page-title">프로젝트</h1><p className="mt-2 text-sm text-ink-2">함께하는 기록, 나만의 정리.</p></div>
      <Link href="/spaces/new" className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-accent-soft px-3 text-xs font-medium text-accent"><Plus size={17} />새 프로젝트</Link>
    </header>
    <HomeProjects userId={user.id} initial={folders} projects={[...rows].sort((a,b)=>b.space.lastActivityAt.getTime()-a.space.lastActivityAt.getTime()).map(({space})=>({id:space.id,name:space.name,kindLabel:labels[space.kind],noteCount:noteCounts.get(space.id)??0,activityLabel:relativeTime(space.lastActivityAt),people:members.filter(member=>member.spaceId===space.id)}))} />
  </div>;
}
