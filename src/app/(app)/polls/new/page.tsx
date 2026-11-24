import { PollCreate } from "@/components/polls/PollCreate";
import { todayInSeoul } from "@/lib/utils";

export default function NewPollPage() {
  return (
    <div className="workspace-page">
      <PollCreate today={todayInSeoul()} />
    </div>
  );
}
