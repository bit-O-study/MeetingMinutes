import { notFound } from "next/navigation";

import { MeetingVote } from "@/components/meetings/MeetingVote";

import { previewMeeting, SPACE_STUDY } from "../fixtures";

/** 개발 전용: DB·로그인 없이 일정 투표 화면을 그린다. ?status=confirmed, ?manager=0 */
export default async function PreviewMeetingPage({ searchParams }: PageProps<"/dev/meeting">) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const status = params.status === "confirmed" ? "confirmed" : "polling";
  return <MeetingVote detail={previewMeeting(status, params.manager !== "0")} spaceId={SPACE_STUDY} preview />;
}
