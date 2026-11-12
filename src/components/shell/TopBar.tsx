import Link from "@/components/PendingLink";
import { Search } from "lucide-react";
import { Logo } from "@/components/ui/Logo";

import { signOut } from "@/lib/auth";
import { AccountMenu } from "./AccountMenu";

/**
 * 검색과 계정은 어느 화면에서도 같은 위치에서 찾을 수 있도록 상단에 둔다.
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

      <div className="ml-auto flex items-center gap-1">
        <Link href="/search" aria-label="기록 검색" className="grid size-11 place-items-center rounded-xl text-ink-2 hover:bg-surface-2 md:hidden"><Search size={21} strokeWidth={1.7} /></Link>
        <AccountMenu user={user} signOutAction={async () => {
          "use server";
          await signOut({ redirectTo: "/login" });
        }} />
      </div>
    </header>
  );
}
