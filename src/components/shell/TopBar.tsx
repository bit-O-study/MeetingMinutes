import Link from "@/components/PendingLink";
import { Search } from "lucide-react";
import { Logo } from "@/components/ui/Logo";

import { signOut } from "@/lib/auth";
import { Avatar } from "@/components/ui/Avatar";

/**
 * 위쪽 막대. 넓은 화면에서는 검색·로그아웃을 두고, 휴대폰에서는 로고만 남긴다
 * (검색·계정은 아래 메뉴로 옮겼다 — 재디자인).
 */
export function TopBar({
  user,
}: {
  user: { id: string; name?: string | null; image?: string | null };
}) {
  return (
    <header
      className="app-topbar"
    >
      <Link href="/" aria-label="moa 홈" className="app-brand flex items-center">
        <Logo />
      </Link>

      <Link
        href="/search"
        className="app-search hidden min-w-0 items-center gap-2 text-sm text-ink-2 md:flex"
      >
        <Search className="size-4 flex-none" />
        <span className="truncate">기록 검색</span>
      </Link>

      <span className="ml-auto text-xs text-ink-2 md:hidden">함께 쌓는 기록</span>
      <form
        className="ml-auto hidden items-center gap-2 md:flex"
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/login" });
        }}
      >
        <span className="hidden max-w-40 truncate text-xs text-ink-2 lg:block">{user.name ?? "내 계정"}</span>
        <Avatar name={user.name} image={user.image} seed={user.id} size={28} />
        <button
          type="submit"
          className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink-2"
        >
          로그아웃
        </button>
      </form>
    </header>
  );
}
