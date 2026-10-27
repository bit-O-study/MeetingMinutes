import Link from "@/components/PendingLink";
import { FolderDown, Search } from "lucide-react";
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
      className="sticky top-0 z-20 flex flex-none items-center gap-3 border-b border-line bg-surface/90 px-4 pb-2 backdrop-blur"
      style={{ paddingTop: "calc(var(--safe-top) + 8px)" }}
    >
      <Link href="/" aria-label="moa 홈" className="flex items-center">
        <Logo />
      </Link>

      <Link
        href="/search"
        className="ml-3 hidden max-w-sm min-w-0 flex-1 items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm text-ink-3 transition-colors hover:text-ink-2 md:flex"
      >
        <Search className="size-4 flex-none" />
        <span className="truncate">노트·이슈 검색</span>
      </Link>

      <Link href="/files" className="ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-bold text-accent hover:bg-accent-soft md:ml-0">
        <FolderDown className="size-4" />자료실
      </Link>
      <form
        className="ml-auto hidden items-center gap-2 md:flex"
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/login" });
        }}
      >
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
