"use client";

import { Check, CircleAlert, Clock, LoaderCircle, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { submitVote } from "@/lib/actions/poll-vote";
import { dayLabel, deadlineLabel } from "@/lib/poll-format";
import type { PublicPollView } from "@/lib/poll-public";
import { remainingLabel, validName } from "@/lib/polls";
import { cn } from "@/lib/utils";

import { HATCH, MonthGrids } from "./MonthGrids";
import { useNow } from "./useNow";

/**
 * 링크로 들어온 사람의 화면(로그인 불필요, 모바일 우선).
 * 기본은 "전부 가능"이고 안 되는 날만 눌러 붉게 바꾼다. 아무것도 안 눌러도 제출해야 응답으로 센다.
 */
export function PollVote({ token, view }: { token: string; view: PublicPollView }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(view.me?.name ?? (view.viewer.isMember ? view.viewer.name : ""));
  const [marks, setMarks] = useState<Set<string>>(() => new Set(view.me?.unavailable ?? []));
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const now = useNow();

  const excluded = useMemo(() => new Map(view.excluded.map((e) => [e.day, e.reason])), [view.excluded]);
  const candidateCount = useMemo(() => {
    let count = 0;
    for (let d = new Date(`${view.rangeStart}T00:00:00Z`); d <= new Date(`${view.rangeEnd}T00:00:00Z`); d = new Date(d.getTime() + 86_400_000)) {
      if (!excluded.has(d.toISOString().slice(0, 10))) count += 1;
    }
    return count;
  }, [view.rangeStart, view.rangeEnd, excluded]);

  const open = view.state === "open";
  const nameError = validName(name);
  const locked = nameError !== null;
  const deadline = view.respondBy ? new Date(view.respondBy) : null;
  const remain = deadline && now ? remainingLabel(deadline, now) : null;

  function toggle(day: string) {
    setMarks((prev) => { const next = new Set(prev); if (next.has(day)) next.delete(day); else next.add(day); return next; });
    setDirty(true);
  }

  function submit() {
    setError("");
    startTransition(async () => {
      const result = await submitVote({ token, name, days: [...marks].sort() });
      if (!result.ok) return setError(result.message);
      setDirty(false);
      router.refresh();
    });
  }

  const header = (
    <header className="flex flex-col gap-1">
      <h1 className="text-2xl font-bold leading-snug text-ink">{view.title}</h1>
      {view.description && <p className="whitespace-pre-wrap text-sm text-ink-2">{view.description}</p>}
    </header>
  );

  /* ── 마감·확정 뒤: 읽기 전용 ── */
  if (!open) {
    return (
      <div className="flex flex-col gap-4">
        {header}
        {view.state === "confirmed" && view.confirmedDay && (
          <section className="flex flex-col gap-1.5 rounded-[20px] bg-accent px-5 py-6 text-on-accent">
            <span className="text-sm">모임 날짜가 정해졌어요</span>
            <strong className="text-3xl leading-tight">{dayLabel(view.confirmedDay)}</strong>
          </section>
        )}
        <div className="flex items-start gap-3 rounded-xl bg-surface-2 px-3.5 py-3 text-ink">
          <Clock className="mt-0.5 size-5 shrink-0 text-ink-2" aria-hidden />
          <div className="flex flex-col leading-snug">
            <strong className="text-[15px]">투표가 마감됐어요</strong>
            <span className="text-[13px] text-ink-2">
              {deadline && view.state === "closed" ? `${deadlineLabel(view.respondBy!)}에 마감돼 ` : ""}더 이상 응답할 수 없어요. 고치고 싶다면 만든 분께 알려 주세요.
            </span>
          </div>
        </div>
        {view.me && <p className="text-sm text-ink-2">{view.me.name}님은 응답했어요 · 안 되는 날 {view.me.unavailable.length}일</p>}
        <section className="rounded-2xl border border-line bg-surface p-4">
          <MonthGrids
            start={view.rangeStart}
            end={view.rangeEnd}
            blankHeight="h-11"
            cell={(day) => {
              const out = excluded.has(day);
              const isConfirmed = view.confirmedDay === day;
              return (
                <div
                  style={out ? HATCH : undefined}
                  aria-label={`${dayLabel(day)}${out ? ", 후보 아님" : ""}${isConfirmed ? ", 확정" : ""}`}
                  className={cn(
                    "flex h-11 items-center justify-center rounded-[10px] text-[15px] ring-1 ring-inset",
                    out ? "text-ink-2 line-through ring-line-2" : isConfirmed ? "bg-accent font-bold text-on-accent ring-accent" : "bg-surface text-ink ring-line",
                  )}
                >
                  {Number(day.slice(8))}
                </div>
              );
            }}
          />
          <div className="mt-3 flex flex-wrap gap-3.5 text-xs text-ink-2">
            {view.confirmedDay && <span className="flex items-center gap-1.5"><span className="size-3.5 rounded bg-accent" />확정 날짜</span>}
            <span className="flex items-center gap-1.5"><span className="size-3.5 rounded" style={HATCH} />후보 아님</span>
          </div>
        </section>
        <p className="text-center text-[13px] text-ink-2">이 링크는 열람만 가능해요.</p>
      </div>
    );
  }

  /* ── 투표 중 ── */
  const markedCount = marks.size;
  const submitted = view.me !== null && !dirty;
  return (
    <div className="flex flex-col gap-4 pb-28">
      {header}

      <div className="flex items-center gap-3 rounded-xl bg-accent-soft px-3.5 py-3 text-accent">
        <Clock className="size-5 shrink-0" aria-hidden />
        <div className="flex flex-col leading-snug">
          <strong className="text-[15px]">{deadline ? `${deadlineLabel(view.respondBy!)} 마감` : "마감 시각 없음"}</strong>
          <span className="text-[13px]">{deadline ? `${remain ?? ""}${remain ? " · " : ""}마감 전까지 수정할 수 있어요` : "만든 분이 마감할 때까지 응답할 수 있어요"}</span>
        </div>
      </div>

      <section className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4">
        <label htmlFor="poll-name" className="text-[15px] font-bold text-ink"><span className="text-accent">1</span> 이름이나 닉네임을 적어 주세요</label>
        <input
          id="poll-name"
          value={name}
          maxLength={40}
          autoComplete="nickname"
          placeholder="예: 민수"
          aria-describedby="poll-name-help"
          aria-invalid={name.length > 0 && locked}
          onChange={(e) => { setName(e.target.value); setDirty(true); setError(""); }}
          className="h-12 w-full rounded-[10px] bg-surface px-3.5 text-base text-ink ring-1 ring-inset ring-line-2 placeholder:text-ink-3 focus:ring-2 focus:ring-accent focus:outline-none"
        />
        <span id="poll-name-help" className={cn("text-[13px]", !locked && name ? "text-ok" : "text-ink-2")}>
          {!locked ? `${name.trim()}님으로 참여해요.` : name.length > 0 ? nameError : "다른 참여자와 만든 사람에게 보여요."}
        </span>
      </section>

      <section className="relative flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
        <div className="text-[15px] font-bold text-ink"><span className="text-accent">2</span> 안 되는 날을 눌러 표시하세요</div>
        <p className="text-[13px] text-ink-2">아무것도 안 누르면 모든 날이 가능해요. 눌러서 붉게 바뀐 날이 “안 되는 날”이에요.</p>
        {locked && <span className="self-start rounded-full bg-warn-soft px-2.5 py-0.5 text-[13px] text-warn">이름을 먼저 적어 주세요</span>}
        <div className={cn(locked && "opacity-50")}>
          <MonthGrids
            start={view.rangeStart}
            end={view.rangeEnd}
            blankHeight="h-12"
            cell={(day) => {
              const out = excluded.has(day);
              const on = marks.has(day);
              return (
                <button
                  type="button"
                  disabled={out || locked}
                  aria-pressed={on}
                  aria-label={`${dayLabel(day)}${out ? `, 후보 아님${excluded.get(day) ? `: ${excluded.get(day)}` : ""}` : on ? ", 안 됨" : ", 가능"}`}
                  title={out ? excluded.get(day) || undefined : undefined}
                  onClick={() => toggle(day)}
                  style={out ? HATCH : undefined}
                  className={cn(
                    "flex h-12 flex-col items-center justify-center gap-px rounded-[10px] text-[15px] leading-none ring-1 ring-inset focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-default",
                    out ? "text-ink-2 line-through ring-line-2" : on ? "bg-danger font-bold text-on-accent ring-danger" : "bg-surface text-ink ring-line-2 active:bg-surface-2",
                  )}
                >
                  <span>{Number(day.slice(8))}</span>
                  {on && <X className="size-3" strokeWidth={3.5} aria-hidden />}
                </button>
              );
            }}
          />
        </div>
        <div className="flex flex-wrap gap-3.5 text-xs text-ink-2">
          <span className="flex items-center gap-1.5"><span className="size-3.5 rounded bg-surface ring-1 ring-line-2" />가능</span>
          <span className="flex items-center gap-1.5"><span className="size-3.5 rounded bg-danger" />안 됨</span>
          <span className="flex items-center gap-1.5"><span className="size-3.5 rounded" style={HATCH} />후보 아님{view.excluded.length > 0 && ` (${view.excluded.length}일)`}</span>
        </div>
        <p className="text-xs text-ink-2">후보 {candidateCount}일 중 {markedCount > 0 ? `${markedCount}일이 안 돼요` : "안 되는 날이 없어요"}</p>
      </section>

      {view.me && (
        <section className="flex flex-col gap-2.5 rounded-2xl bg-ok-soft p-4 text-ink">
          <div className="flex items-center gap-2 font-bold text-ok"><Check className="size-5" aria-hidden />{view.me.name}님의 응답을 받았어요</div>
          <span className="text-[13px] text-ink-2">{deadline ? `${deadlineLabel(view.respondBy!)}까지 ` : "마감 전까지 "}이 기기에서 다시 열어 고칠 수 있어요.{!view.viewer.isMember && " 다른 기기에서는 수정할 수 없어요."}</span>
          {view.results && view.results.total > 0 && (
            <div className="flex flex-col gap-1.5 rounded-xl bg-surface p-3">
              <strong className="text-sm">지금까지 가장 많이 되는 날</strong>
              {view.results.top.map((t) => (
                <div key={t.day} className="flex justify-between text-sm"><span>{dayLabel(t.day)}</span><span className="text-ink-2">{t.available}/{view.results!.total}명</span></div>
              ))}
            </div>
          )}
        </section>
      )}

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-surface px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
        <div className="mx-auto flex max-w-md items-center gap-3">
          <div className="flex min-w-0 flex-1 flex-col leading-snug">
            {error ? (
              <span role="alert" className="flex items-center gap-1.5 text-[13px] text-danger"><CircleAlert className="size-4 shrink-0" aria-hidden />{error}</span>
            ) : (
              <>
                <strong className="text-[15px] text-ink">{markedCount === 0 ? "안 되는 날 없음" : `안 되는 날 ${markedCount}일`}</strong>
                <span className="truncate text-xs text-ink-2">{markedCount === 0 ? "모든 날이 가능하다고 제출해요" : [...marks].sort().slice(0, 3).map((d) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`).join(", ") + (markedCount > 3 ? " 외" : "")}</span>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={submit}
            disabled={locked || pending || submitted}
            className={cn("inline-flex h-12 shrink-0 items-center gap-2 rounded-xl px-5 text-base font-bold text-on-accent disabled:cursor-not-allowed", submitted ? "bg-ok" : locked ? "bg-ink-3" : "bg-accent")}
          >
            {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
            {submitted ? "제출됨" : view.me ? "수정해서 제출" : "제출하기"}
          </button>
        </div>
      </div>
    </div>
  );
}
