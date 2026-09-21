import { redirect } from "next/navigation";
import { and, eq, isNull, sql } from "drizzle-orm";

import { Sidebar } from "@/components/shell/Sidebar";
import { TopBar } from "@/components/shell/TopBar";
import { listMySpaces } from "@/lib/access";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { tasks } from "@/lib/db/schema";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = {
    id: session.user.id,
    name: session.user.name,
    image: session.user.image,
  };

  const [spaceRows, [taskCount]] = await Promise.all([
    listMySpaces(),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(tasks)
      .where(and(eq(tasks.assigneeId, user.id), isNull(tasks.doneAt))),
  ]);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <TopBar user={user} />
      <div className="flex flex-1">
        <Sidebar spaces={spaceRows.map((r) => r.space)} openTaskCount={taskCount?.n ?? 0} />
        <main className="flex min-w-0 flex-1 flex-col">{children}</main>
      </div>
    </div>
  );
}
