import Link from "next/link";
import { redirect } from "next/navigation";
import { NotebookText } from "lucide-react";

import { auth } from "@/lib/auth";
import { passwordSignIn, passwordSignUp } from "@/lib/actions/password-auth";
import { loginReturnTo } from "@/lib/login-input";
import { ActionSubmit } from "@/components/screens/ActionSubmit";

const errors: Record<string, string> = {
  invalid: "입력 내용을 확인해 주세요. 비밀번호는 12~128자이며, 가입 시 두 번 동일하게 입력해야 합니다.",
  credentials: "이메일 또는 비밀번호가 올바르지 않습니다.",
  unavailable: "이 이메일로 가입할 수 없습니다. 다른 이메일을 사용하거나 로그인해 주세요.",
  limited: "시도가 너무 많습니다. 15분 후 다시 시도해 주세요.",
  server: "지금은 로그인 처리를 완료할 수 없습니다. 잠시 후 다시 시도해 주세요.",
};

export default async function LoginPage({ searchParams }: {
  searchParams: Promise<{ mode?: string; error?: string; returnTo?: string }>;
}) {
  const query = await searchParams;
  const returnTo = loginReturnTo(query.returnTo);
  const session = await auth();
  if (session?.user) redirect(returnTo);
  const registering = query.mode === "register";
  const message = query.error && Object.hasOwn(errors, query.error) ? errors[query.error] : null;
  const switchUrl = `/login?${new URLSearchParams({ mode: registering ? "login" : "register", returnTo })}`;
  const inputClass = "w-full rounded border border-line bg-ground px-3 py-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-accent";

  return <main className="flex flex-1 items-center justify-center px-5 py-12">
    <section className="flex w-full max-w-sm flex-col gap-5 rounded-lg border border-line bg-surface px-7 py-9">
      <div className="flex flex-col items-center gap-3 text-center">
        <NotebookText className="size-8 text-accent" aria-hidden="true" />
        <h1 className="font-serif text-2xl font-bold text-ink">{registering ? "회의록 회원가입" : "회의록 로그인"}</h1>
        <p className="text-sm leading-relaxed text-ink-2">개발 스터디와 인수인계 메모를<br />같이 쓰고 같이 관리합니다.</p>
      </div>
      {returnTo !== "/" && <p className="text-sm text-ink-2">로그인 후 초대받은 스페이스 참여를 이어갑니다.</p>}
      {message && <p role="alert" className="rounded border border-line bg-ground px-3 py-2 text-sm text-warn">{message}</p>}
      <form action={registering ? passwordSignUp : passwordSignIn} className="space-y-4">
        <input type="hidden" name="returnTo" value={returnTo} />
        {registering && <div className="space-y-1.5">
          <label htmlFor="name" className="text-sm font-medium text-ink-2">이름</label>
          <input id="name" name="name" autoComplete="name" required maxLength={50} className={inputClass} />
        </div>}
        <div className="space-y-1.5">
          <label htmlFor="email" className="text-sm font-medium text-ink-2">이메일</label>
          <input id="email" name="email" type="email" autoComplete="username" required maxLength={254} className={inputClass} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="password" className="text-sm font-medium text-ink-2">비밀번호</label>
          <input id="password" name="password" type="password" autoComplete={registering ? "new-password" : "current-password"}
            required minLength={12} maxLength={128} aria-describedby="password-hint" className={inputClass} />
          <p id="password-hint" className="text-xs text-ink-3">12~128자로 입력해 주세요.</p>
        </div>
        {registering && <div className="space-y-1.5">
          <label htmlFor="passwordConfirm" className="text-sm font-medium text-ink-2">비밀번호 확인</label>
          <input id="passwordConfirm" name="passwordConfirm" type="password" autoComplete="new-password" required minLength={12} maxLength={128} className={inputClass} />
        </div>}
        <ActionSubmit>{registering ? "가입하고 시작하기" : "로그인"}</ActionSubmit>
      </form>
      <p className="text-center text-sm text-ink-2">
        {registering ? "이미 계정이 있나요? " : "처음 방문하셨나요? "}
        <Link href={switchUrl} className="text-accent underline">{registering ? "로그인" : "회원가입"}</Link>
      </p>
    </section>
  </main>;
}
