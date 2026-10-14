import Link from "next/link";
import { NotebookText, Search } from "lucide-react";

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
      className="sticky top-0 z-20 flex flex-none items-center gap-3 border-b border-line bg-surface/90 px-4 pb-2.5 backdrop-blur"
      style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 10px)" }}
    >
      <Link href="/" className="flex items-center gap-2 text-[15px] font-black tracking-tight text-ink">
        <span className="grid size-7 place-items-center rounded-lg bg-accent text-on-accent">
          <NotebookText className="size-4" />
        </span>
        프로젝트 메모
      </Link>

      <Link
        href="/search"
        className="ml-3 hidden max-w-sm min-w-0 flex-1 items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm text-ink-3 transition-colors hover:text-ink-2 md:flex"
      >
        <Search className="size-4 flex-none" />
        <span className="truncate">노트·이슈 검색</span>
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
