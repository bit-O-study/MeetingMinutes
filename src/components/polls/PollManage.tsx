"use client";

import { Check, CircleAlert, Clock, LoaderCircle, Star, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { buttonClass, fieldClass } from "@/components/ui/Button";
import {
  closePoll, confirmPollDay, deletePoll, removeParticipant, reopenPoll, revokePollLink, rotatePollLink, setDeadline, unconfirmPoll,
  type PollResult,
} from "@/lib/actions/polls";
import type { OwnerPollView } from "@/lib/poll-data";
import { dayLabel, deadlineLabel, seoulEvening, toSeoulLocal } from "@/lib/poll-format";
import { remainingLabel, seoulLocalToIso } from "@/lib/polls";
import { cn } from "@/lib/utils";

import { HATCH, MonthGrids } from "./MonthGrids";
import { PollInfo } from "./PollInfo";
import { useNow } from "./useNow";

const CARD = "flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5";
const SMALL_BTN = "h-9 rounded-lg px-3 text-[13px] font-medium ring-1 ring-inset ring-line-2 bg-surface text-ink hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-45";

export function PollManage({ poll, today, created }: { poll: OwnerPollView; today: string; created: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const now = useNow();
  const [dlInput, setDlInput] = useState(poll.respondBy ? toSeoulLocal(poll.respondBy) : "");
  const [selected, setSelected] = useState<string | null>(poll.confirmedDay ?? poll.tally.best ?? poll.candidates[0] ?? null);

  // 다른 화면·연장 버튼으로 마감이 바뀌면 입력칸도 따라간다(렌더 중 비교로 맞추는 것이 effect 보다 한 번 덜 그린다).
  const [seenDeadline, setSeenDeadline] = useState(poll.respondBy);
  if (seenDeadline !== poll.respondBy) {
    setSeenDeadline(poll.respondBy);
    setDlInput(poll.respondBy ? toSeoulLocal(poll.respondBy) : "");
  }

  const names = useMemo(() => new Map(poll.participants.map((p) => [p.id, p.name])), [poll.participants]);
  const excluded = useMemo(() => new Set(poll.excluded), [poll.excluded]);
  const { tally } = poll;
  const confirmed = poll.status === "confirmed";

  function run(action: () => Promise<PollResult>) {
    setError("");
    startTransition(async () => {
      const result = await action();
      if (!result.ok) return setError(result.message);
      router.refresh();
    });
  }

  /** 연장은 지금 마감 시각에 더한다. 이미 지났거나 없으면 오늘 저녁 18시에 더한다. */
  function extend(days: number) {
    const current = poll.respondBy ? new Date(poll.respondBy) : null;
    const base = current && now && current.getTime() > now.getTime() ? current : new Date(seoulLocalToIso(seoulEvening(today, 0)) ?? Date.now());
    run(() => setDeadline({ pollId: poll.id, respondBy: new Date(base.getTime() + days * 86_400_000).toISOString(), version: poll.version }));
  }

  function applyInput() {
    const iso = dlInput ? seoulLocalToIso(dlInput) : null;
    if (dlInput && !iso) return setError("마감 시각을 확인해 주세요.");
    run(() => setDeadline({ pollId: poll.id, respondBy: iso, version: poll.version }));
  }

  const statusLabel = confirmed ? "확정" : poll.closed ? "마감" : "진행 중";
  const statusTone = confirmed ? "bg-accent-soft text-accent" : poll.closed ? "bg-surface-2 text-ink-2" : "bg-ok-soft text-ok";
  const deadline = poll.respondBy ? new Date(poll.respondBy) : null;
  const remain = deadline && now ? remainingLabel(deadline, now) : null;

  const noList = selected ? (tally.unavailableBy[selected] ?? []).map((id) => names.get(id) ?? "").filter(Boolean) : [];
  const yesList = selected ? poll.participants.filter((p) => !(tally.unavailableBy[selected] ?? []).includes(p.id)).map((p) => p.name) : [];

  async function copy() {
    if (!poll.url) return;
    try { await navigator.clipboard.writeText(poll.url); setCopied(true); window.setTimeout(() => setCopied(false), 2000); } catch { setError("복사하지 못했어요. 링크를 직접 선택해 복사해 주세요."); }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 break-keep">
      <header className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-ink">{poll.title}</h1>
          <span className={cn("rounded-full px-3 py-0.5 text-[13px] font-bold", statusTone)}>{statusLabel}</span>
        </div>
        <p className="text-sm text-ink-2">
          {dayLabel(poll.rangeStart)} ~ {dayLabel(poll.rangeEnd)} · 후보 {poll.candidates.length}일{poll.excluded.length > 0 && ` (제외 ${poll.excluded.length}일)`} · {poll.participants.length}명 응답
        </p>
        <PollInfo foodType={poll.foodType} restaurant={poll.restaurant} location={poll.location} />
      </header>

      {created && !confirmed && (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-2xl bg-ok-soft px-5 py-4 text-ok">
          <Check className="size-5" aria-hidden />
          <strong className="text-[15px]">투표를 만들었어요</strong>
        </div>
      )}

      {confirmed && poll.confirmedDay && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-ok-soft px-5 py-4 text-ok">
          <Check className="size-5" aria-hidden />
          <strong className="flex-1 text-[17px]">{dayLabel(poll.confirmedDay)} 확정</strong>
          <button type="button" disabled={pending} onClick={() => run(() => unconfirmPoll(poll.id))} className="h-10 rounded-xl px-4 text-sm font-bold ring-1 ring-inset ring-ok">확정 취소</button>
        </div>
      )}

      {error && (
        <p role="alert" className="flex items-center gap-2 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger"><CircleAlert className="size-4 shrink-0" aria-hidden />{error}</p>
      )}

      <div className="flex flex-wrap items-start gap-5">
        {/* 히트맵 */}
        <section className={cn(CARD, "min-w-0 flex-[1.5_1_520px] gap-4 p-6")}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-bold text-ink">날짜별 안 되는 인원</h2>
            <div className="flex items-center gap-2 text-[13px] text-ink-2" aria-hidden>
              안 되는 사람 적음<span className="h-2.5 w-24 rounded-full" style={{ background: "linear-gradient(90deg, var(--surface-2), var(--danger))" }} />많음
            </div>
          </div>
          {tally.total === 0 && <p className="text-sm text-ink-2">아직 응답이 없어요</p>}
          <MonthGrids
            start={poll.rangeStart}
            end={poll.rangeEnd}
            gap="gap-1.5"
            blankHeight="h-[70px]"
            cell={(day) => {
              if (excluded.has(day)) {
                return (
                  <div style={HATCH} className="flex h-[70px] flex-col justify-between rounded-xl p-2 text-ink-2 ring-1 ring-inset ring-line-2" aria-label={`${dayLabel(day)} 제외일`}>
                    <span className="text-sm whitespace-nowrap line-through">{Number(day.slice(8))}</span>
                    <span className="text-xs whitespace-nowrap">제외</span>
                  </div>
                );
              }
              const available = tally.available[day] ?? 0;
              const unavailable = tally.total - available;
              const ratio = tally.total > 0 ? unavailable / tally.total : 0;
              const pct = Math.round(6 + ratio * 80);
              const isBest = day === tally.best;
              return (
                <button
                  type="button"
                  aria-pressed={selected === day}
                  aria-label={`${dayLabel(day)}, 총 ${tally.total}명 중 ${unavailable}명 안 됨${isBest ? ", 추천" : ""}${poll.confirmedDay === day ? ", 확정" : ""}`}
                  onClick={() => setSelected(day)}
                  style={tally.total > 0 ? { background: `color-mix(in srgb, var(--danger) ${pct}%, var(--surface))` } : undefined}
                  className={cn(
                    "flex h-[70px] flex-col items-stretch justify-between rounded-xl p-2 text-left focus-visible:outline-2 focus-visible:outline-accent",
                    tally.total === 0 && "bg-surface-2",
                    pct >= 75 && tally.total > 0 ? "text-on-accent" : "text-ink",
                    selected === day ? "ring-2 ring-ink" : "ring-1 ring-inset ring-transparent",
                    poll.confirmedDay === day && "outline-2 outline-offset-2 outline-ok",
                  )}
                >
                  <span className="flex items-start justify-between text-sm font-medium">
                    {Number(day.slice(8))}
                    {isBest && <Star className="size-4 fill-current" aria-hidden />}
                  </span>
                  <span className="text-xs whitespace-nowrap sm:text-[13px]">{tally.total > 0 ? `${unavailable}/${tally.total}명` : "–"}</span>
                </button>
              );
            }}
          />
          <div className="flex flex-wrap items-center gap-4 text-[13px] text-ink-2">
            <span className="flex items-center gap-1.5"><Star className="size-3.5 fill-current" aria-hidden />가장 적은 날</span>
            <span className="flex items-center gap-1.5"><span className="size-3.5 rounded" style={HATCH} />제외일</span>
            <span>안 됨/총원</span>
          </div>

          {tally.total > 0 && (
            <div className="flex flex-col gap-2 border-t border-line pt-4">
              <strong className="text-[15px] text-ink">추천 날짜</strong>
              {tally.ranked.slice(0, 3).map((day, index) => (
                <button key={day} type="button" onClick={() => setSelected(day)} className="flex h-12 items-center gap-3 rounded-xl bg-surface px-3.5 text-left text-[15px] text-ink ring-1 ring-inset ring-line hover:bg-surface-2">
                  <span className="w-6 font-bold text-accent">{index + 1}</span>
                  <span className="flex-1">{dayLabel(day)}</span>
                  <span className="text-sm text-ink-2">총 {tally.total}명 중 {tally.total - tally.available[day]}명 안 됨</span>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* 오른쪽 패널 */}
        <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-4">
          {selected && (
            <section className={CARD} aria-live="polite">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-base font-bold text-ink">{dayLabel(selected)}{selected === tally.best && " · 추천"}</h2>
                <span className="text-sm text-ink-2">비참석 {tally.total - (tally.available[selected] ?? 0)}/{tally.total}명</span>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-[13px] font-bold text-ok">참석자 {yesList.length}명</span>
                <div className="flex flex-wrap gap-1.5">
                  {yesList.length === 0 ? <span className="text-sm text-ink-2">없음</span> : yesList.map((n) => <span key={n} className="rounded-full bg-ok-soft px-2.5 py-1 text-[13px] text-ok">{n}</span>)}
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-[13px] font-bold text-danger">비참석자 {noList.length}명</span>
                <div className="flex flex-wrap gap-1.5">
                  {noList.length === 0 ? <span className="text-sm text-ink-2">없음</span> : noList.map((n) => <span key={n} className="rounded-full bg-danger-soft px-2.5 py-1 text-[13px] text-danger">{n}</span>)}
                </div>
              </div>
              <button type="button" disabled={pending || poll.confirmedDay === selected} onClick={() => run(() => confirmPollDay(poll.id, selected))} className={buttonClass("primary")}>
                {poll.confirmedDay === selected ? "확정됨" : "이 날짜로 확정"}
              </button>
            </section>
          )}

          {/* 마감 관리 */}
          <section className={CARD}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-bold text-ink">투표 마감</h2>
              <span className={cn("rounded-full px-3 py-0.5 text-[13px] font-bold", statusTone)}>{statusLabel}</span>
            </div>
            <div className="flex items-start gap-3">
              <Clock className="mt-1 size-5 shrink-0 text-ink-2" aria-hidden />
              <div className="flex flex-col">
                <strong className="text-base text-ink">{poll.respondBy ? deadlineLabel(poll.respondBy) : "마감 시각 없음"}</strong>
                <span className="text-sm text-ink-2">
                  {confirmed ? "확정됨" : poll.status === "closed" ? "마감됨" : deadline && now ? (remain ?? "마감됨") : ""}
                </span>
              </div>
            </div>
            <fieldset disabled={confirmed || pending} className="flex flex-col gap-3 disabled:opacity-60">
              <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
                마감 시각 바꾸기
                <div className="flex gap-2">
                  <input type="datetime-local" className={cn(fieldClass, "flex-1")} min={`${today}T00:00`} value={dlInput} onChange={(e) => setDlInput(e.target.value)} />
                  <button type="button" onClick={applyInput} className={cn(buttonClass("secondary"), "h-11")}>적용</button>
                </div>
              </label>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => extend(1)} className={SMALL_BTN}>+1일 연장</button>
                <button type="button" onClick={() => extend(3)} className={SMALL_BTN}>+3일 연장</button>
                <button type="button" onClick={() => run(() => setDeadline({ pollId: poll.id, respondBy: null, version: poll.version }))} disabled={!poll.respondBy} className={SMALL_BTN}>마감 없애기</button>
                {poll.status === "closed" || (poll.closed && !confirmed)
                  ? <button type="button" onClick={() => run(() => reopenPoll(poll.id))} className={cn(SMALL_BTN, "font-bold text-accent ring-accent")}>다시 열기</button>
                  : <button type="button" onClick={() => run(() => closePoll(poll.id))} className={cn(SMALL_BTN, "font-bold text-danger ring-danger")}>지금 마감</button>}
              </div>
            </fieldset>
          </section>

          {/* 링크 */}
          <section className={CARD}>
            <h2 className="text-base font-bold text-ink">참여 링크</h2>
            {poll.url ? (
              <>
                <div className="flex gap-2">
                  <input readOnly aria-label="공유 링크" value={poll.url} onFocus={(e) => e.currentTarget.select()} className="h-10 min-w-0 flex-1 rounded-lg bg-ground px-3 text-sm text-ink ring-1 ring-inset ring-line-2" />
                  <button type="button" onClick={copy} className={cn(buttonClass("primary", "sm"), "h-10")}>{copied ? "복사됨" : "복사"}</button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={pending} onClick={() => { if (window.confirm("이전 링크는 못 써요. 새 링크를 만들까요?")) run(() => rotatePollLink(poll.id)); }} className={SMALL_BTN}>새 링크 만들기</button>
                  <button type="button" disabled={pending} onClick={() => { if (window.confirm("링크를 폐기할까요?")) run(() => revokePollLink(poll.id)); }} className={SMALL_BTN}>링크 폐기</button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-ink-2">{poll.revoked ? "폐기된 링크" : "링크 없음"}</p>
                <button type="button" disabled={pending} onClick={() => run(() => rotatePollLink(poll.id))} className={buttonClass("primary", "sm")}>새 링크 만들기</button>
              </>
            )}
          </section>

          {/* 참여자 */}
          <section className={cn(CARD, "gap-1")}>
            <h2 className="mb-2 text-base font-bold text-ink">응답한 사람 {poll.participants.length}명</h2>
            {poll.participants.length === 0 && <p className="text-sm text-ink-2">없음</p>}
            {poll.participants.map((p) => (
              <div key={p.id} className="flex h-11 items-center gap-2.5 border-t border-line">
                <span className="grid size-7 place-items-center rounded-full bg-accent-soft text-[13px] font-bold text-accent" aria-hidden>{[...p.name][0]}</span>
                <span className="flex-1 truncate text-[15px] text-ink">{p.name}{p.isMember && <span className="ml-1.5 rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-ink-2">회원</span>}</span>
                <span className="text-[13px] text-ink-2">불가 {p.unavailable.length}일</span>
                <button
                  type="button"
                  aria-label={`${p.name} 응답 삭제`}
                  disabled={pending}
                  onClick={() => { if (window.confirm(`${p.name}님의 응답을 삭제할까요?`)) run(() => removeParticipant(poll.id, p.id)); }}
                  className="grid size-8 place-items-center rounded-lg text-ink-2 hover:bg-surface-2"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </section>

          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (!window.confirm("투표와 응답을 모두 삭제할까요?")) return;
              startTransition(async () => {
                const result = await deletePoll(poll.id);
                if (!result.ok) return setError(result.message);
                router.push("/polls");
              });
            }}
            className={cn(buttonClass("danger", "sm"), "self-start")}
          >
            {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}투표 삭제
          </button>
        </div>
      </div>
    </div>
  );
}
