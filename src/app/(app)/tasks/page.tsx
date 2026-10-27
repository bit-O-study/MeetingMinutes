import { PlannerScreen } from "@/components/screens/PlannerScreen";
import { ProjectAssignments } from "@/components/screens/ProjectAssignments";
import { personalTaskItems, plannerSummary } from "@/lib/planner-data";
import { todayInSeoul } from "@/lib/utils";
export default async function TasksPage({ searchParams }: PageProps<"/tasks">) {
  const params = await searchParams;
  const status = params.status === "done" || params.status === "all" ? params.status : "open";
  const page = typeof params.page === "string" && /^\d{1,6}$/.test(params.page) ? Math.max(1, Number(params.page)) : 1;
  const [result, summary] = await Promise.all([personalTaskItems(status, page), plannerSummary()]);
  const today = todayInSeoul();
  return <PlannerScreen view="tasks" {...result} summary={summary} today={today} month={today.slice(0, 7)} status={status} page={page} projectTasks={<ProjectAssignments searchParams={searchParams} />} />;
}