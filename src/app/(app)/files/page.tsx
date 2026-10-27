import Link from "@/components/PendingLink";
import { FolderDown, ChevronRight } from "lucide-react";
import { listMySpaces } from "@/lib/access";
import { ProjectIcon } from "@/components/ui/ProjectIcon";

export default async function FilesPage() {
  const rows = await listMySpaces();
  return <section className="mx-auto flex w-full max-w-3xl flex-col gap-5 p-4 md:p-6">
    <header><h1 className="flex items-center gap-2 text-2xl font-extrabold text-ink"><FolderDown className="size-6 text-accent" />자료실</h1><p className="mt-2 text-sm text-ink-2">프로젝트를 선택해 앱 설치 파일과 배포 자료를 확인하세요.</p></header>
    {rows.length ? <ul className="flex flex-col gap-3">{rows.map(({ space }) => <li key={space.id}>
      <Link href={`/s/${space.id}/files`} className="flex min-h-20 items-center gap-3 rounded-2xl border border-line bg-surface p-4 transition-colors hover:bg-surface-2">
        <ProjectIcon spaceId={space.id} name={space.name} size="sm" />
        <span className="min-w-0 flex-1"><span className="block truncate font-bold text-ink">{space.name}</span><span className="mt-1 block text-xs text-ink-3">APK · 앱 패키지 · 배포 자료</span></span><ChevronRight className="size-4 shrink-0 text-ink-3" />
      </Link>
    </li>)}</ul> : <p className="rounded-2xl border border-line bg-surface p-6 text-center text-ink-2">참여한 프로젝트의 자료실이 여기에 표시돼요.</p>}
  </section>;
}
