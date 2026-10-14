import { after } from "next/server";
import { redirect } from "next/navigation";
import { and, eq, isNull, sql } from "drizzle-orm";

import { BottomNav } from "@/components/shell/BottomNav";
import { Sidebar } from "@/components/shell/Sidebar";
import { TopBar } from "@/components/shell/TopBar";
import { listMySpaces } from "@/lib/access";
import { auth, signOut } from "@/lib/auth";
import { db } from "@/lib/db";
import { notes, spaceMembers, spaces, tasks } from "@/lib/db/schema";
import { recordVisit } from "@/lib/visits";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = {
    id: session.user.id,
    name: session.user.name,
    image: session.user.image,
  };

  // 하루 접속 기록(통합 어드민 통계) — 응답을 보낸 뒤에 써서 화면 여는 시간을 늘리지 않는다.
  after(() => recordVisit(user.id));

  const [spaceRows, [taskCount]] = await Promise.all([
    listMySpaces(),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(tasks)
      .innerJoin(notes, and(eq(notes.id, tasks.noteId), eq(notes.spaceId, tasks.spaceId)))
      .innerJoin(spaces, eq(spaces.id, notes.spaceId))
      .innerJoin(spaceMembers, and(eq(spaceMembers.spaceId, spaces.id), eq(spaceMembers.userId, user.id)))
      .where(and(eq(tasks.assigneeId, user.id), isNull(tasks.doneAt), isNull(notes.deletedAt), isNull(spaces.deletedAt))),
  ]);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <TopBar user={user} />
      <div className="flex flex-1">
        <Sidebar spaces={spaceRows.map((r) => r.space)} openTaskCount={taskCount?.n ?? 0} />
        {/* 휴대폰에서는 아래 메뉴가 떠 있으므로 그만큼 아래를 비운다. */}
        <main className="flex min-w-0 flex-1 flex-col pb-[calc(var(--safe-bottom)+64px)] md:pb-0">{children}</main>
      </div>
      <BottomNav
        user={user}
        openTaskCount={taskCount?.n ?? 0}
        signOutAction={async () => {
          "use server";
          await signOut({ redirectTo: "/login" });
        }}
      />
    </div>
  );
}
