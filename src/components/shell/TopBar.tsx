import Link from "next/link";
import { NotebookText, Search } from "lucide-react";

import { signOut } from "@/lib/auth";
import { Avatar } from "@/components/ui/Avatar";

export function TopBar({
  user,
}: {
  user: { id: string; name?: string | null; image?: string | null };
}) {
  return (
    <header className="flex flex-none items-center gap-3 border-b border-line bg-surface px-4 py-2.5">
      <Link href="/" className="flex items-center gap-1.5 font-serif font-semibold text-ink">
        <NotebookText className="size-4 text-accent" />
        회의록
      </Link>

      <Link
        href="/search"
        className="ml-2 flex min-w-0 flex-1 max-w-sm items-center gap-2 rounded border border-line bg-ground px-2.5 py-1.5 text-sm text-ink-3 transition-colors hover:border-line-2"
      >
        <Search className="size-3.5 flex-none" />
        <span className="truncate">검색</span>
      </Link>

      <form
        className="ml-auto flex items-center gap-2"
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/login" });
        }}
      >
        <Avatar name={user.name} image={user.image} seed={user.id} />
        <button
          type="submit"
          className="rounded px-2 py-1 text-xs text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink-2"
        >
          로그아웃
        </button>
      </form>
    </header>
  );
}
