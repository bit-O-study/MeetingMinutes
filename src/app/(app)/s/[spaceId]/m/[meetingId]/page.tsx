import { notFound } from "next/navigation";
import { z } from "zod";

import { MeetingVote } from "@/components/meetings/MeetingVote";
import { getMeetingDetail } from "@/lib/meeting-data";

const id = z.string().uuid();

/** 일정 투표 화면. 권한 없음과 없는 모임은 같은 화면(notFound)으로 처리한다. */
export default async function MeetingPage({ params }: PageProps<"/s/[spaceId]/m/[meetingId]">) {
  const { spaceId, meetingId } = await params;
  if (!id.safeParse(spaceId).success || !id.safeParse(meetingId).success) notFound();
  const detail = await getMeetingDetail(spaceId, meetingId);
  if (!detail) notFound();
  return <MeetingVote detail={detail} spaceId={spaceId} />;
}
