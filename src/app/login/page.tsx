import { redirect } from "next/navigation";
import { NotebookText } from "lucide-react";

import { auth, signIn } from "@/lib/auth";
import { devSignIn, devSignInAs, listDevUsers } from "@/lib/actions/dev-auth";
import { Avatar } from "@/components/ui/Avatar";

const isDev = process.env.NODE_ENV === "development";
const googleReady = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/");

  const devUsers = await listDevUsers();

  return (
    <div className="flex flex-1 items-center justify-center px-5 py-12">
      <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-lg border border-line bg-surface px-7 py-9">
        <NotebookText className="size-8 text-accent" />
        <h1 className="font-serif text-2xl font-bold text-ink">회의록</h1>
        <p className="text-center text-sm leading-relaxed text-ink-2">
          개발 스터디와 인수인계 메모를
          <br />
          같이 쓰고 같이 관리합니다.
        </p>

        {googleReady ? (
          <form
            className="mt-2 w-full"
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: "/" });
            }}
          >
            <button
              type="submit"
              className="w-full rounded bg-accent px-4 py-2.5 text-sm font-medium text-on-accent transition-opacity hover:opacity-90"
            >
              구글 계정으로 시작
            </button>
          </form>
        ) : (
          <p className="mt-1 w-full rounded border border-line bg-ground px-3 py-2 text-center text-xs leading-relaxed text-ink-3">
            구글 로그인은 <code className="font-mono">AUTH_GOOGLE_ID</code> ·{" "}
            <code className="font-mono">AUTH_GOOGLE_SECRET</code>을
            <br />
            채우면 켜집니다.
          </p>
        )}

        {isDev && <DevLogin users={devUsers} />}
      </div>
    </div>
  );
}

/**
 * 개발 환경에서만 보인다. 운영 빌드에는 아예 렌더되지 않는다.
 * 공동 편집을 확인하려면 서로 다른 사용자 둘이 같은 노트를 열어야 한다.
 */
function DevLogin({
  users,
}: {
  users: { id: string; name: string | null; email: string }[];
}) {
  return (
    <section className="mt-2 w-full border-t border-line pt-4">
      <h2 className="mb-2 font-mono text-[10px] uppercase tracking-[0.09em] text-ink-3">
        개발 전용 로그인
      </h2>

      <form action={devSignIn} className="flex gap-2">
        <input
          id="dev-name"
          name="name"
          placeholder="이름"
          autoComplete="off"
          className="min-w-0 flex-1 rounded border border-line bg-ground px-2.5 py-1.5 text-sm text-ink outline-none placeholder:text-ink-3 focus:border-accent"
        />
        <button
          type="submit"
          className="flex-none rounded border border-line px-3 py-1.5 text-xs text-ink-2 transition-colors hover:bg-surface-2"
        >
          들어가기
        </button>
      </form>

      {users.length > 0 && (
        <div className="mt-3 flex flex-col gap-1">
          <p className="font-mono text-[10px] text-ink-3">계정 전환</p>
          <div className="flex flex-wrap gap-1.5">
            {users.map((user) => (
              <form key={user.id} action={devSignInAs.bind(null, user.id)}>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 rounded border border-line px-2 py-1 text-xs text-ink-2 transition-colors hover:bg-surface-2"
                >
                  <Avatar name={user.name} seed={user.id} size={16} />
                  {user.name}
                </button>
              </form>
            ))}
          </div>
        </div>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-ink-3">
        공동 편집을 확인하려면 일반 창과 시크릿 창에서 각각 다른 이름으로 들어가
        같은 노트를 여세요.
      </p>
    </section>
  );
}
