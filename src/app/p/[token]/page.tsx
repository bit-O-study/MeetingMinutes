/**
 * ┌─────────────────────────────────────────────────────────────┐
 * │  S-09 · 공유 열람 뷰        담당: CLAUDE                     │
 * └─────────────────────────────────────────────────────────────┘
 *
 * 비로그인 사용자가 노트 1건만 읽는다.
 *
 * 감추는 것: 할 일 패널·체크 조작, 접속자·커서, 변경 이력,
 * 공유 관리, 다른 노트로 가는 모든 경로.
 * 이 페이지에는 앱 셸이 없다 — 사이드바가 붙으면 남의 스페이스 목록이 보인다.
 */
import type { Metadata } from "next";
import { NotebookText } from "lucide-react";

import { ReadOnlyNote } from "@/components/ReadOnlyNote";
import { readSharedNote } from "@/lib/shares";
import { TIME_ZONE } from "@/lib/utils";

/** 링크가 살아 있어도 검색엔진에 올라갈 이유는 없다. */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function SharedNotePage({ params }: PageProps<"/p/[token]">) {
  const { token } = await params;
  const note = await readSharedNote(token);

  if (!note) return <Unavailable />;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-5 py-10">
      <header className="flex flex-col gap-2 border-b border-line pb-4">
        <div className="flex items-center gap-2">
          <NotebookText className="size-3.5 text-accent" />
          <span className="font-mono text-[10px] uppercase tracking-[0.09em] text-ink-3">
            읽기 전용으로 공유된 노트
          </span>
        </div>
        <h1 className="font-serif text-2xl font-bold text-ink">{note.title}</h1>
        <p className="font-mono text-[11px] text-ink-3">
          {note.spaceName} · {formatDate(note.updatedAt)} 수정
        </p>
      </header>

      <article>
        <ReadOnlyNote content={note.content} />
      </article>

      <footer className="border-t border-line pt-4 text-[11px] leading-relaxed text-ink-3">
        이 링크는 언제든 회수될 수 있습니다. 내용이 바뀌면 바뀐 내용이 보입니다.
      </footer>
    </div>
  );
}

/**
 * 만료·회수·없는 토큰을 모두 같은 화면으로 처리한다.
 * 노트 제목도 스페이스 이름도 내보내지 않는다 — 링크의 존재 여부 자체가 정보다.
 */
function Unavailable() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-24 text-center">
      <div className="size-7 rounded-full border border-line-2" />
      <p className="font-serif text-base font-semibold text-ink">링크를 열 수 없습니다</p>
      <p className="max-w-xs text-sm leading-relaxed text-ink-2">
        만료되었거나 회수된 링크입니다. 공유한 분에게 새 링크를 요청하세요.
      </p>
    </div>
  );
}

function formatDate(at: Date) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}
