import { CopyInvite } from "./CopyInvite";
import { InviteExpirySelect, InviteForm } from "./InviteExpirySelect";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Card, EmptyState } from "@/components/ui/Panels";
import { ActionSubmit } from "@/components/screens/ActionSubmit";
import {
  listSpaceMembers, listInviteLinks, createInviteLink, revokeInviteLink,
  reissueInviteLink, removeMember, transferOwnership, leaveSpace,
} from "@/lib/actions/spaces";

function expiryDays(data: FormData) {
  const value = String(data.get("expiry") ?? "7");
  return value === "none" ? null : value === "1" ? 1 : value === "30" ? 30 : 7;
}

export async function SpaceMembers({ spaceId, role, userId, members }: { spaceId: string; role: "owner" | "member"; userId: string; members: Awaited<ReturnType<typeof listSpaceMembers>> }) {
  // 일반 멤버에게는 초대 토큰을 조회하거나 전달하지 않는다.
  const invites = role === "owner" ? await listInviteLinks(spaceId) : [];
  return <div className="space-y-5">
    <section aria-label="멤버 목록" className="space-y-2">
      <h2 className="text-sm font-semibold text-ink">멤버 {members.length}명</h2>
      <Card><ul className="divide-y divide-line">
        {members.map((member) => <li key={member.id} className="flex flex-wrap items-center gap-3 p-4">
          <Avatar seed={member.id} name={member.name} image={member.image} size={30} />
          <span className="min-w-0 flex-1 break-words text-sm text-ink">{member.name ?? "이름 없음"}{member.id === userId && " (나)"}</span>
          <Badge tone={member.role === "owner" ? "accent" : "neutral"}>{member.role === "owner" ? "소유자" : "멤버"}</Badge>
          {role === "owner" && member.id !== userId && member.role !== "owner" && <div className="flex flex-wrap gap-2">
            <form action={removeMember.bind(null, spaceId, member.id)}>
              <ActionSubmit confirmation={`${member.name ?? "이 멤버"}님을 제외하면 이 스페이스의 노트에 접근할 수 없습니다. 제외할까요?`}>멤버 제외</ActionSubmit>
            </form>
            <form action={transferOwnership.bind(null, spaceId, member.id)}>
              <ActionSubmit confirmation={`${member.name ?? "이 멤버"}님에게 소유권을 넘기면 나는 일반 멤버가 됩니다. 이전할까요?`}>소유권 이전</ActionSubmit>
            </form>
          </div>}
        </li>)}
      </ul></Card>
      {role === "owner" ? <p className="text-xs text-ink-3">나가려면 먼저 다른 멤버에게 소유권을 이전해 주세요.{members.length === 1 && " 아래에서 초대 링크를 만들어 함께할 멤버를 초대하세요."}</p> :
        <form action={leaveSpace.bind(null, spaceId)}>
          <ActionSubmit confirmation="나가면 이 스페이스의 노트에 접근할 수 없습니다. 나갈까요?">스페이스 나가기</ActionSubmit>
        </form>}
    </section>
    {role === "owner" && <section aria-label="초대 링크 관리" className="space-y-3">
      <h2 className="text-sm font-semibold text-ink">초대 링크</h2>
      <p className="text-xs text-ink-3">링크로 참여한 멤버는 모든 노트와 할 일을 함께 편집합니다. 재발급하면 기존 링크는 회수됩니다.</p>
      <InviteForm className="flex flex-wrap gap-3" action={async (data: FormData) => {
        "use server";
        await createInviteLink(spaceId, { expiresInDays: expiryDays(data) });
      }}>
        <InviteExpirySelect id="invite-expiry" /><ActionSubmit>초대 링크 만들기</ActionSubmit>
      </InviteForm>
      {invites.length === 0 ? <Card><EmptyState title="아직 초대 링크가 없습니다" hint="유효 기간을 고르고 초대 링크를 만들어 멤버에게 전달하세요." /></Card> :
        <ul className="space-y-3">{invites.map((invite) => <li key={invite.id}><Card className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={invite.active ? "ok" : "neutral"}>{invite.revokedAt ? "회수됨" : invite.active ? "사용 가능" : "만료됨"}</Badge>
            <span className="text-xs text-ink-3">{invite.expiresAt ? `${invite.expiresAt.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} 만료 (한국 시간)` : "만료 없음"}</span>
          </div>
          {invite.active && <CopyInvite id={`url-${invite.id}`} url={invite.url} />}
          <div className="flex flex-wrap items-center gap-3">
            {invite.active && <form action={revokeInviteLink.bind(null, invite.id)}>
              <ActionSubmit confirmation="이 링크로는 더 이상 참여할 수 없게 됩니다. 회수할까요?">링크 회수</ActionSubmit>
            </form>}
            <InviteForm className="flex flex-wrap gap-2" action={async (data: FormData) => {
              "use server";
              await reissueInviteLink(invite.id, expiryDays(data));
            }}>
              <InviteExpirySelect id={`expiry-${invite.id}`} permanent={!invite.expiresAt} />
              <ActionSubmit confirmation="기존 링크를 회수하고 선택한 유효 기간으로 새 링크를 발급할까요?">재발급</ActionSubmit>
            </InviteForm>
          </div>
        </Card></li>)}</ul>}
    </section>}
  </div>;
}
