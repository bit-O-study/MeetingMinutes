export type ProjectTaskFilter = { assignee: string; state: "all" | "open" | "done" };

export function projectTaskFilter(query: Record<string, string | string[] | undefined>): ProjectTaskFilter {
  return {
    assignee: typeof query.assignee === "string" ? query.assignee : "",
    state: query.taskState === "open" || query.taskState === "done" ? query.taskState : "all",
  };
}

export function filterProjectTasks<T extends { assigneeId: string | null; done: boolean }>(rows: T[], filter: ProjectTaskFilter, userId: string) {
  return rows.filter(row => {
    const matchesAssignee = !filter.assignee || (filter.assignee === "me" ? row.assigneeId === userId
      : filter.assignee === "unassigned" ? row.assigneeId === null : row.assigneeId === filter.assignee);
    return matchesAssignee && (filter.state === "all" || row.done === (filter.state === "done"));
  });
}
