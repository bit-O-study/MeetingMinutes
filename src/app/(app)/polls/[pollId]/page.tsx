import { notFound } from "next/navigation";

import { PollManage } from "@/components/polls/PollManage";
import { loadOwnerPoll } from "@/lib/poll-data";
import { todayInSeoul } from "@/lib/utils";

/** 남의 투표와 없는 투표는 같은 화면(not-found)이다. */
export default async function PollPage({ params, searchParams }: PageProps<"/polls/[pollId]">) {
  const [{ pollId }, query] = await Promise.all([params, searchParams]);
  const poll = await loadOwnerPoll(pollId);
  if (!poll) notFound();
  return (
    <div className="workspace-page">
      <PollManage poll={poll} today={todayInSeoul()} created={query.created === "1"} />
    </div>
  );
}
