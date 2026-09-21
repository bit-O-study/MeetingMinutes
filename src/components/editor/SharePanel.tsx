"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Copy, Link2, X } from "lucide-react";

import {
  createShareLink,
  listShareLinks,
  revokeShareLink,
  type ShareLinkView,
} from "@/lib/actions/shares";
import { Badge } from "@/components/ui/Badge";
import { TIME_ZONE } from "@/lib/utils";

/** 스터디 회의록 한 번 보여 주기와 인수인계 기간 내내 열어 두기는 필요한 기간이 다르다. */
const EXPIRY_CHOICES = [
  { days: 7, label: "7일" },
  { days: 30, label: "30일" },
  { days: null, label: "없음" },
] as const;

/**
 * S-07 공유 링크 관리.
 *
 * 편집 화면 안 패널로 연다. 별도 페이지로 빼면 "돌아와서 계속 쓴다"는 흐름이 끊긴다.
 */
export function SharePanel({ noteId, onClose }: { noteId: string; onClose: () => void }) {
  const [links, setLinks] = useState<ShareLinkView[] | null>(null);
  const [expiry, setExpiry] = useState<number | null>(7);
  const [copied, setCopied] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    void listShareLinks(noteId).then(setLinks);
  }, [noteId]);

  const active = links?.filter((l) => l.active) ?? [];
  const dead = links?.filter((l) => !l.active) ?? [];

  async function copy(url: string, id: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(id);
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 2000);
    } catch {
      // 클립보드를 막아 둔 브라우저도 있다. 주소가 화면에 보이므로 직접 복사하면 된다.
      setCopied(null);
    }
  }

  return (
    <aside className="flex w-full flex-none flex-col border-t border-line bg-surface lg:w-80 lg:border-t-0 lg:border-l">
      <header className="flex flex-none items-center gap-2 border-b border-line px-4 py-2">
        <h2 className="font-serif text-sm font-semibold text-ink">공유 링크</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="공유 닫기"
          className="ml-auto rounded p-1 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <X className="size-3.5" />
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
        <section className="flex flex-col gap-2">
          <p className="text-[11px] leading-relaxed text-ink-2">
            링크를 아는 사람은 <b className="text-ink">이 노트만</b> 읽을 수 있습니다.
            할 일 체크와 변경 이력은 보이지 않습니다.
          </p>

          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[10px] text-ink-3">만료</span>
            {EXPIRY_CHOICES.map((choice) => (
              <button
                key={choice.label}
                type="button"
                onClick={() => setExpiry(choice.days)}
                className={`rounded border px-2 py-0.5 font-mono text-[10px] transition-colors ${
                  expiry === choice.days
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line text-ink-2 hover:bg-surface-2"
                }`}
              >
                {choice.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const created = await createShareLink(noteId, { expiresInDays: expiry });
                setLinks((prev) => [...(prev ?? []), created]);
                void copy(created.url, created.id);
              })
            }
            className="flex items-center justify-center gap-1.5 rounded bg-accent px-3 py-2 text-xs text-on-accent transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            <Link2 className="size-3" />
            링크 만들고 복사
          </button>
        </section>

        {links === null && <p className="font-mono text-[10px] text-ink-3">불러오는 중…</p>}

        {links !== null && links.length === 0 && (
          <p className="text-[11px] leading-relaxed text-ink-3">
            아직 발급한 링크가 없습니다.
          </p>
        )}

        {active.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="font-mono text-[10px] uppercase tracking-[0.07em] text-ink-3">
              사용 중 {active.length}
            </h3>
            {active.map((link) => (
              <div key={link.id} className="flex flex-col gap-1.5 rounded border border-line p-2.5">
                <div className="flex items-center gap-1.5">
                  <code className="min-w-0 flex-1 truncate font-mono text-[10px] text-ink-2">
                    {link.url}
                  </code>
                  <button
                    type="button"
                    onClick={() => copy(link.url, link.id)}
                    aria-label="링크 복사"
                    className="rounded p-1 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
                  >
                    {copied === link.id ? (
                      <Check className="size-3 text-ok" />
                    ) : (
                      <Copy className="size-3" />
                    )}
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone={link.expiresAt ? "neutral" : "warn"}>
                    {link.expiresAt ? `${fmt(link.expiresAt)}까지` : "만료 없음"}
                  </Badge>
                  <Badge>조회 {link.viewCount}</Badge>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => setLinks(await revokeShareLink(link.id)))
                    }
                    className="ml-auto rounded border border-line px-2 py-0.5 font-mono text-[10px] text-accent transition-colors hover:bg-accent-soft disabled:opacity-40"
                  >
                    회수
                  </button>
                </div>
              </div>
            ))}
          </section>
        )}

        {dead.length > 0 && (
          <section className="flex flex-col gap-1.5">
            <h3 className="font-mono text-[10px] uppercase tracking-[0.07em] text-ink-3">
              끝난 링크 {dead.length}
            </h3>
            {/* 토큰을 지우지 않고 남겨 둔다. 언제 뿌렸고 몇 번 열렸는지가 나중에 궁금해진다. */}
            {dead.map((link) => (
              <div key={link.id} className="flex items-center gap-1.5 text-[10px] text-ink-3">
                <Badge>{link.revokedAt ? "회수됨" : "만료됨"}</Badge>
                <span className="font-mono">{fmt(link.createdAt)} 발급</span>
                <span className="ml-auto font-mono">조회 {link.viewCount}</span>
              </div>
            ))}
          </section>
        )}
      </div>
    </aside>
  );
}

function fmt(at: Date | string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: TIME_ZONE,
    month: "2-digit",
    day: "2-digit",
  }).format(typeof at === "string" ? new Date(at) : at);
}
