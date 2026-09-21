import Link from "next/link";
import { redirect } from "next/navigation";
import { Avatar } from "@/components/ui/Avatar";
import { Card, EmptyState, SectionHeading } from "@/components/ui/Panels";
import { ActionSubmit } from "@/components/screens/ActionSubmit";
import { peekInvite, joinByInviteToken } from "@/lib/actions/spaces";
import { auth } from "@/lib/auth";

export default async function JoinPage({ params, searchParams }: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ login?: string | string[] }>;
}) {
  const { token } = await params;
  // 참여 전에는 미리보기 액션만 사용해 노트 정보가 조회되지 않도록 한다.
  const invite = await peekInvite(token);
  if (!invite) return <main className="mx-auto w-full max-w-lg px-5 py-12"><Card>
    <EmptyState title="사용할 수 없는 초대 링크입니다" hint="스페이스 소유자에게 새 초대 링크를 요청해 주세요." action={{ href: "/", label: "홈으로" }} />
  </Card></main>;

  const session = await auth();
  const query = await searchParams;
  const returnTo = `/join/${encodeURIComponent(token)}`;

  async function join() {
    "use server";
    // 미리보기를 연 뒤 만료되거나 로그인 세션이 끝났어도 같은 안내 화면으로 돌아간다.
    if (!await peekInvite(token)) redirect(returnTo);
    const current = await auth();
    if (!current?.user?.id) redirect(`${returnTo}?login=required`);
    await joinByInviteToken(token);
  }

  return <main className="mx-auto w-full max-w-lg px-5 py-12">
    <SectionHeading>스페이스 초대</SectionHeading>
    <Card className="space-y-5 p-5">
      <h2 className="break-words font-serif text-xl font-semibold text-ink">{invite.spaceName}</h2>
      <section aria-label="함께할 멤버" className="space-y-3">
        <h3 className="text-sm font-medium text-ink-2">함께할 멤버</h3>
        <ul className="space-y-2">{invite.members.map((member) => <li key={member.id} className="flex items-center gap-2">
          <Avatar seed={member.id} name={member.name} image={member.image} size={28} />
          <span className="break-words text-sm text-ink">{member.name ?? "이름 없음"}</span>
        </li>)}</ul>
        <p className="text-xs text-ink-3">멤버는 최대 6명까지 미리 보여 드립니다.</p>
      </section>
      <p className="text-sm leading-relaxed text-ink-2">참여하면 이 스페이스의 모든 노트와 할 일을 함께 읽고 편집할 수 있습니다.</p>
      {query.login === "required" && !session?.user?.id && <p role="alert" className="text-sm text-warn">먼저 로그인한 뒤 참여해 주세요.</p>}
      {session?.user?.id ? <form action={join} className="space-y-3">
        <p className="text-xs text-ink-3">{session.user.name ?? "현재 계정"}님으로 참여합니다. 이미 멤버라면 스페이스로 이동합니다.</p>
        <ActionSubmit>스페이스 참여하기</ActionSubmit>
      </form> : <div className="space-y-3">
        <Link href={`/login?returnTo=${encodeURIComponent(returnTo)}`} className="inline-block rounded bg-accent px-4 py-2 text-sm text-on-accent">로그인하고 계속</Link>
        <p className="text-xs text-ink-3">계정이 없다면 로그인 화면에서 회원가입할 수 있습니다.</p>
      </div>}
      <Link href="/" className="inline-block text-sm text-ink-3 hover:text-accent">홈으로</Link>
    </Card>
  </main>;
}
