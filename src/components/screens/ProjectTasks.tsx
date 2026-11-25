import Link from "@/components/PendingLink";
import { Card, EmptyState } from "@/components/ui/Panels";
import { TaskRow, type TaskRowData } from "./TaskRow";
import { filterProjectTasks, projectTaskFilter } from "./project-task-view";
import styles from "./Project.module.css";

export function ProjectTasks({ spaceId, userId, today, members, rows, query }: {
  spaceId: string;
  userId: string;
  today: string;
  members: { id: string; name: string | null }[];
  rows: (TaskRowData & { assigneeId: string | null })[];
  query: Record<string, string | string[] | undefined>;
}) {
  const filter = projectTaskFilter(query);
  const visible = filterProjectTasks(rows, filter, userId);
  const unknownAssignee = filter.assignee && !["me", "unassigned"].includes(filter.assignee) && !members.some(member => member.id === filter.assignee);
  const groups = [
    { title: "기한 지남", rows: visible.filter(row => !row.done && row.overdue) },
    { title: "미완료", rows: visible.filter(row => !row.done && !row.overdue) },
    { title: "완료", rows: visible.filter(row => row.done) },
  ];
  return <>
    <form key={`${filter.assignee}:${filter.state}`} action={`/s/${spaceId}`} method="get" className={styles.taskFilters}>
      <input type="hidden" name="tab" value="tasks" />
      <label>담당자<select name="assignee" defaultValue={filter.assignee}>
        <option value="">모든 담당자</option><option value="me">내 담당</option><option value="unassigned">미지정 · 공용</option>
        {unknownAssignee && <option value={filter.assignee}>현재 멤버가 아닌 담당자</option>}
        {members.map(member => <option key={member.id} value={member.id}>{member.name ?? "이름 없음"}{member.id === userId ? " (나)" : ""}</option>)}
      </select></label>
      <label>완료 여부<select name="taskState" defaultValue={filter.state}>
        <option value="all">전체</option><option value="open">미완료</option><option value="done">완료</option>
      </select></label>
      <button type="submit">적용</button>
      {(filter.assignee || filter.state !== "all") && <Link href={`/s/${spaceId}?tab=tasks`}>조건 초기화</Link>}
    </form>
    <p className="text-sm text-ink-2">전체 {rows.length}개 중 {visible.length}개 · 기한순</p>
    {groups.filter(group => group.rows.length > 0).map(group => <section key={group.title} aria-label={group.title} className="flex flex-col gap-2">
      <h2 className="px-1 text-sm font-semibold text-ink">{group.title} <span className="text-ink-3">{group.rows.length}</span></h2>
      <Card><ul className="divide-y divide-line">{group.rows.map(task => <TaskRow key={task.id} today={today} task={task} />)}</ul></Card>
    </section>)}
    {rows.length === 0 ? <Card><EmptyState title="아직 할 일이 없어요" hint="노트에 체크 목록을 쓰면 여기에 모여요." action={{ href: `/s/${spaceId}?tab=notes`, label: "노트 보기" }} /></Card>
      : visible.length === 0 && <Card><EmptyState title="조건에 맞는 할 일이 없어요" hint="담당자나 완료 여부를 바꾸어 확인해 보세요." action={{ href: `/s/${spaceId}?tab=tasks`, label: "전체 할 일 보기" }} /></Card>}
  </>;
}
