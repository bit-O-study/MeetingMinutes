/**
 * 일정 투표 참여 화면 — 링크를 받은 누구나(로그인 불필요).
 *
 * 이 페이지에는 앱 셸이 없다. 사이드바가 붙으면 로그인한 사람에게 자기 스페이스 목록이 보인다.
 * 없는 링크·폐기·삭제는 모두 같은 "열 수 없는 링크" 화면이다(존재 여부 자체가 정보).
 */
import type { Metadata } from "next";

import { PollVote } from "@/components/polls/PollVote";
import { LogoMark } from "@/components/ui/Logo";
import { getPublicPoll } from "@/lib/poll-public";

export const metadata: Metadata = {
  title: "일정 투표",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function PollVotePage({ params }: PageProps<"/v/[token]">) {
  const { token } = await params;
  const view = await getPublicPoll(token);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-5">
      <div className="flex items-center gap-2 text-sm font-bold text-ink-2">
        <LogoMark size={20} />
        일정 투표
      </div>
      {view ? <PollVote token={token} view={view} /> : <Unavailable />}
    </div>
  );
}

function Unavailable() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-24 text-center">
      <div className="size-7 rounded-full border border-line-2" />
      <p className="text-base font-semibold text-ink">링크를 열 수 없습니다</p>
      <p className="max-w-xs text-sm leading-relaxed text-ink-2">만료되었거나 회수된 링크예요. 보낸 분에게 새 링크를 요청하세요.</p>
    </div>
  );
}
