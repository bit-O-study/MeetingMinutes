import Link from "next/link";
import { ProjectPackages } from "@/components/screens/ProjectPackages";
import { requireSpaceMember } from "@/lib/access";
import { listProjectPackages } from "@/lib/attachments";
import { uploadDirectory } from "@/lib/attachment-storage";
export default async function ProjectFilesPage({ params, searchParams }: { params: Promise<{ spaceId: string }>; searchParams: Promise<{ page?: string | string[] }> }) {
  const { spaceId } = await params;
  const rawPage = (await searchParams).page;
  const requestedPage = typeof rawPage === "string" && /^[1-9]\d*$/.test(rawPage) ? Number(rawPage) : 1;
  const { space } = await requireSpaceMember(spaceId);
  const { files, page, hasNext } = await listProjectPackages(spaceId, requestedPage);
  let storageReady = true;
  try { uploadDirectory(); } catch { storageReady = false; }
  return <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 p-4 md:p-6">
    <Link href={"/s/" + spaceId} className="text-sm font-semibold text-accent">← 프로젝트로 돌아가기</Link>
    <header><h1 className="text-2xl font-extrabold text-ink">{space.name} · 자료실</h1><p className="mt-2 text-sm text-ink-2">프로젝트별 앱 패키지를 올리고 멤버들과 공유하세요.</p></header>
    <ProjectPackages spaceId={spaceId} files={files.map(file => ({ ...file, createdAt: file.createdAt.toISOString() }))} storageReady={storageReady} page={page} hasNext={hasNext} />
  </main>;
}
