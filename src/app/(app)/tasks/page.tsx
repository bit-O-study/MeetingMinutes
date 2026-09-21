/**
 * S-04 내 할 일 · CODEX
 * 지연은 상태가 아니라 기한으로 계산한 묶음이다.
 */
import Link from "next/link";
import { and, asc, eq, inArray, isNull, isNotNull } from "drizzle-orm";
import { Card, CardTitle, EmptyState, SectionHeading } from "@/components/ui/Panels";
import { TaskRow } from "@/components/screens/TaskRow";
import { mySpaceIds } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { notes, tasks } from "@/lib/db/schema";
import { cn, isOverdue, todayInSeoul } from "@/lib/utils";

export default async function TasksPage({ searchParams }: PageProps<"/tasks">) {
  const params = await searchParams;
  const status = params.status === "done" || params.status === "all" ? params.status : "open";
  const spaceIds = await mySpaceIds();
  const user = await requireUser();
  const today = todayInSeoul();
  // 서울 날짜를 UTC 달력으로만 계산해 실행 서버의 시간대에 영향을 받지 않는다.
  const weekEnd = new Date(today + "T00:00:00Z");
  weekEnd.setUTCDate(weekEnd.getUTCDate() + (7 - weekEnd.getUTCDay()) % 7);
  const sunday = weekEnd.toISOString().slice(0, 10);
  const rows = spaceIds.length ? await db
    .select({ task: tasks, noteTitle: notes.title, spaceId: notes.spaceId })
    .from(tasks)
    .innerJoin(notes, and(eq(notes.id, tasks.noteId), eq(notes.spaceId, tasks.spaceId)))
    .where(and(
      inArray(notes.spaceId, spaceIds),
      isNull(notes.deletedAt),
      eq(tasks.assigneeId, user.id),
      status === "open" ? isNull(tasks.doneAt) : status === "done" ? isNotNull(tasks.doneAt) : undefined,
    ))
    .orderBy(asc(tasks.dueDate), asc(tasks.createdAt), asc(tasks.id)) : [];

  const groups: { title: string; rows: typeof rows }[] = [
    { title: "지연", rows: [] },
    { title: "이번 주", rows: [] },
    { title: "그 이후", rows: [] },
    { title: "기한 없음", rows: [] },
    { title: "완료", rows: [] },
  ];
  for (const row of rows) {
    const { task } = row;
    const index = task.doneAt ? 4 : isOverdue(task.dueDate, task.doneAt) ? 0
      : !task.dueDate ? 3 : task.dueDate <= sunday ? 1 : 2;
    groups[index].rows.push(row);
  }
  groups[4].rows.sort((a, b) => b.task.doneAt!.getTime() - a.task.doneAt!.getTime());
  const filters = [{ value: "open", label: "미완료" }, { value: "done", label: "완료" }, { value: "all", label: "전체" }];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-5 py-8">
      <SectionHeading>내 할 일</SectionHeading>
      <p className="text-sm text-ink-2">참여 중인 스페이스에서 나에게 배정된 할 일입니다. 공용 할 일은 스페이스에서 확인하세요.</p>
      <nav aria-label="할 일 상태" className="flex flex-wrap gap-2">
        {filters.map((filter) => (
          <Link key={filter.value} href={"/tasks?status=" + filter.value}
            aria-current={status === filter.value ? "page" : undefined}
            className={cn("rounded border px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-accent",
              status === filter.value ? "border-accent bg-accent-soft text-accent" : "border-line bg-surface text-ink-2 hover:bg-surface-2")}>
            {filter.label}
          </Link>
        ))}
      </nav>
      <p className="text-xs text-ink-3">{rows.length}개 · 기한은 한국 시간 기준이며 이번 주는 일요일까지입니다.</p>
      {groups.filter((group) => group.rows.length > 0).map((group) => (
        <Card key={group.title} tone={group.title === "지연" ? "accent" : "plain"}>
          <CardTitle tone={group.title === "지연" ? "accent" : "plain"}>{group.title} · {group.rows.length}</CardTitle>
          <ul className="divide-y divide-line">
            {group.rows.map(({ task, noteTitle, spaceId }) => (
              <TaskRow key={task.id} today={today} task={{
                id: task.id, body: task.body, noteId: task.noteId, spaceId, noteTitle,
                dueDate: task.dueDate, done: Boolean(task.doneAt), overdue: isOverdue(task.dueDate, task.doneAt),
              }} />
            ))}
          </ul>
        </Card>
      ))}
      {rows.length === 0 && (
        <Card><EmptyState
          title={status === "done" ? "완료한 할 일이 없습니다" : status === "open" ? "남은 할 일이 없습니다" : "배정된 할 일이 없습니다"}
          hint={status === "done" ? "완료한 항목은 여기서 확인하고 다시 열 수 있습니다." : "노트에서 나에게 배정된 할 일이 여기에 모입니다."}
          action={{ href: "/", label: "내 스페이스 보기" }} /></Card>
      )}
    </div>
  );
}
