import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/ui/Logo";
import styles from "@/components/screens/Entry.module.css";

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
  session: "로그인이 만료되었습니다. 다시 로그인하면 메모 만들기를 이어갈 수 있어요.",
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
  const inputClass = "w-full rounded-2xl ring-1 ring-inset ring-line bg-ground px-3 py-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-accent";

  return <main className={styles.login}>
    <section className={styles.story} aria-label="모아 소개">
      <Logo />
      <div className={styles.storyCopy}><h2>함께 쓰면,<br />회의가<br />기록이 됩니다.</h2><p>스터디 회의록과 인수인계 메모를 여럿이 동시에 쓰고,<br />할 일까지 한곳에서 챙겨요. 저장 버튼은 없어요.</p></div>
      <div className={styles.orbits} aria-hidden="true"><i /><i /><i /></div>
    </section>
    <div className={styles.formSide}><section className={styles.form}>
      <div className="space-y-3">
        <h1>{registering ? "함께 기록을 시작해요" : "다시 만나서 반가워요"}</h1>
        <p className="text-sm leading-relaxed text-ink-2">{registering ? "계정을 만들고 팀의 기록을 모아 보세요." : "계정으로 로그인하세요."}</p>
      </div>
      {returnTo !== "/" && <p className="text-sm text-ink-2">{returnTo.startsWith("/join/") ? "로그인 후 초대받은 스페이스 참여를 이어갑니다." : "로그인 후 메모 만들기를 이어갑니다."}</p>}
      {message && <p role="alert" className="rounded-2xl ring-1 ring-inset ring-line bg-ground px-3 py-2 text-sm text-warn">{message}</p>}
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
        <ActionSubmit wide>{registering ? "가입하고 시작하기" : "로그인"}</ActionSubmit>
      </form>
      <p className="text-center text-sm text-ink-2">
        {registering ? "이미 계정이 있나요? " : "처음 방문하셨나요? "}
        <Link href={switchUrl} className="text-accent underline">{registering ? "로그인" : "회원가입"}</Link>
      </p>
    </section></div>
  </main>;
}
