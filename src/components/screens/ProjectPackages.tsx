"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
type PackageFile = { id: string; name: string; size: number; sha256: string; versionLabel: string; description: string; createdAt: string };
export function ProjectPackages({ spaceId, files, storageReady, page, hasNext }: { spaceId: string; files: PackageFile[]; storageReady: boolean; page: number; hasNext: boolean }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/spaces/" + spaceId + "/files", { method: "POST", body: data });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "업로드하지 못했어요.");
      formRef.current?.reset();
      setMessage("파일을 올렸어요. 이 프로젝트의 멤버에게 링크를 공유할 수 있어요.");
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "파일을 올리지 못했어요. 다시 시도해 주세요."); }
    finally { setBusy(false); }
  }
  async function copy(id: string) {
    try { await navigator.clipboard.writeText(new URL("/api/attachments/" + id, location.origin).href); setMessage("다운로드 링크를 복사했어요. 프로젝트 멤버만 열 수 있어요."); }
    catch { setMessage("링크를 복사하지 못했어요. 다운로드 버튼의 링크 주소를 복사해 주세요."); }
  }
  return <div className="flex flex-col gap-5">
    <form ref={formRef} onSubmit={upload} className="rounded-2xl border border-line bg-surface p-4">
      <fieldset disabled={busy || !storageReady} className="flex min-w-0 flex-col gap-3">
        <legend className="mb-3 text-base font-bold text-ink">새 패키지 올리기</legend>
        <label className="flex flex-col gap-1 text-sm text-ink-2">파일 (APK·AAB·APKS·ZIP, 최대 64MB)<input name="file" type="file" accept=".apk,.aab,.apks,.zip" required className="min-w-0 w-full rounded-xl border border-line p-2 text-ink" /></label>
        <label className="flex flex-col gap-1 text-sm text-ink-2">버전 (선택)<input name="version" maxLength={60} placeholder="예: 1.0.4 테스트" className="rounded-xl border border-line bg-ground p-2 text-ink" /></label>
        <label className="flex flex-col gap-1 text-sm text-ink-2">변경 내용 (선택)<textarea name="description" maxLength={1000} rows={3} className="rounded-xl border border-line bg-ground p-2 text-ink" /></label>
        <button type="submit" className="self-start rounded-xl bg-accent px-4 py-2 font-bold text-on-accent disabled:opacity-50">{busy ? "올리는 중…" : "파일 올리기"}</button>
      </fieldset>
      {!storageReady && <p role="status" className="mt-3 text-sm text-warn">파일 저장소 연결 후 업로드할 수 있어요.</p>}
      <p className="mt-3 text-xs text-ink-3">빌드한 파일을 올리면 이 프로젝트의 멤버들이 내려받을 수 있어요.</p>
    </form>
    {message && <p role="status" className="rounded-xl bg-surface-2 p-3 text-sm text-ink">{message}</p>}
    {files.length === 0 ? <p className="rounded-2xl border border-line p-6 text-center text-ink-3">{page === 1 ? "아직 올린 패키지가 없어요." : "이 페이지에는 패키지가 없어요. 이전 페이지로 이동해 주세요."}</p> : <ul className="flex flex-col gap-3">
      {files.map(file => <li key={file.id} className="min-w-0 rounded-2xl border border-line bg-surface p-4">
        <h2 className="break-all font-bold text-ink">{file.name}</h2>
        {file.versionLabel && <p className="mt-1 text-sm font-semibold text-accent">{file.versionLabel}</p>}
        <p className="mt-1 text-xs text-ink-3">{(file.size / 1024 / 1024).toLocaleString("ko-KR", { maximumFractionDigits: 2 })} MB · {new Date(file.createdAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</p>
        {file.description && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-ink-2">{file.description}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          <a href={"/api/attachments/" + file.id} className="rounded-xl bg-accent px-3 py-2 text-sm font-bold text-on-accent">다운로드</a>
          <button type="button" onClick={() => void copy(file.id)} className="rounded-xl border border-line px-3 py-2 text-sm font-bold text-ink">공유 링크 복사</button>
        </div>
        <details className="mt-3 text-xs text-ink-3"><summary>파일 확인용 SHA-256</summary><code className="mt-1 block break-all">{file.sha256}</code></details>
      </li>)}
    </ul>}
    {(page > 1 || hasNext) && <nav aria-label="패키지 목록 페이지" className="flex items-center justify-center gap-4 text-sm">
      {page > 1 && <Link href={"/s/" + spaceId + "/files?page=" + (page - 1)} scroll={false} className="rounded-xl border border-line px-3 py-2 font-bold text-ink">이전</Link>}
      <span aria-current="page" className="text-ink-2">{page} 페이지</span>
      {hasNext && <Link href={"/s/" + spaceId + "/files?page=" + (page + 1)} scroll={false} className="rounded-xl border border-line px-3 py-2 font-bold text-ink">다음</Link>}
    </nav>}
  </div>;
}
