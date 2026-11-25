import Link from "@/components/PendingLink";
import { Logo } from "@/components/ui/Logo";

import { signOut } from "@/lib/auth";
import { AccountMenu } from "./AccountMenu";
import { SearchButton } from "./SearchButton";

/**
 * 휴대폰 상단바. 검색은 데스크톱 사이드바와 같은 팔레트를 연다.
 * 계정은 아래 메뉴에도 있으므로 여기서는 검색만 둔다.
 */
export function TopBar({
  user,
}: {
  user: { id: string; name?: string | null; image?: string | null };
}) {
  return (
    <header className="app-topbar">
      <Link href="/" aria-label="moa 홈" className="app-brand flex items-center">
        <Logo />
      </Link>
      <SearchButton className="app-search flex min-w-0 items-center gap-2 text-sm text-ink-2" />
      <div className="ml-auto flex items-center gap-1 md:hidden">
        <AccountMenu user={user} signOutAction={async () => {
          "use server";
          await signOut({ redirectTo: "/login" });
        }} />
      </div>
    </header>
  );
}
