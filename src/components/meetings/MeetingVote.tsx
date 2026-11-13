"use client";

import Link from "@/components/PendingLink";
import { ArrowLeft, Check, CircleAlert, Clock, Eraser, FileText, Hourglass, LoaderCircle, MapPin, RotateCcw, Sparkles, Trash2, Triangle, Users, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";

import { Avatar } from "@/components/ui/Avatar";
import { cancelMeeting, confirmMeeting, reopenMeeting, setMeetingResponses } from "@/lib/actions/meetings";
import { addDays, dayRangeLabel, shortDay, startOfWeek, weekdayLabel } from "@/lib/calendar-dates";
import { weekDays } from "@/lib/calendar-layout";
import { heatLevel, isPastDeadline, rankWindows, tallyDay, windowStatus, type Answer, type RankedWindow, type Votes } from "@/lib/meetings";
import type { MeetingDetail, MeetingMember } from "@/lib/meeting-data";
import { cn } from "@/lib/utils";

type Props = { detail: MeetingDetail; spaceId: string; preview?: boolean };
type Pen = Answer | "clear";

/** 응답 한 줄은 색과 아이콘 모양 둘 다로 구분한다(색만으로 구분하지 않는다). */
const PENS: { value: Pen; label: string; icon: typeof Check; on: string }[] = [
  { value: "yes", label: "가능", icon: Check, on: "bg-ok text-white ring-ok" },
  { value: "maybe", label: "조건부", icon: Triangle, on: "bg-warn text-white ring-warn" },
  { value: "no", label: "불가", icon: X, on: "bg-ink-2 text-white ring-ink-2" },
  { value: "clear", label: "지우기", icon: Eraser, on: "bg-surface-2 text-ink ring-line-2" },
];
const MARK: Record<Answer, { icon: typeof Check; label: string; chip: string }> = {
  yes: { icon: Check, label: "가능", chip: "bg-ok text-white" },
  maybe: { icon: Triangle, label: "조건부", chip: "bg-warn text-white" },
  no: { icon: X, label: "불가", chip: "bg-ink-2 text-white" },
};
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const WORD: Record<"yes" | "maybe" | "no" | "none", string> = { yes: "가능", maybe: "조건부", no: "불가", none: "미응답" };

function whenLabel(start: string, end: string, from: string | null, to: string | null) {
  return `${dayRangeLabel(start, end)}${from && to ? ` ${from}–${to}` : ""}`;
}

/** 사람을 이름 대신 아바타로 보인다. 가능하면 또렷하게, 조건부는 점 하나, 불가·미응답은 흐리게. */
function MemberStack({ members, status, size = 28 }: { members: MeetingMember[]; status: (id: string) => "yes" | "maybe" | "no" | "none"; size?: number }) {
  return (
    <ul className="flex flex-wrap items-center gap-1.5">
      {members.map((member) => {
        const s = status(member.id);
        return (
          <li key={member.id} title={`${member.name} · ${WORD[s]}`} className={cn("relative", (s === "no" || s === "none") && "opacity-35")}>
            <span className="block rounded-full"><Avatar name={member.name} seed={member.id} size={size} /></span>
            {s === "maybe" && <i aria-hidden="true" className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-warn ring-2 ring-surface" />}
            <span className="sr-only">{member.name} {WORD[s]}</span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * 모임 일정 투표. 후보 기간의 날짜를 캘린더에서 칠해 가능·조건부·불가를 낸다.
 *
 * 내 응답은 바로 화면에 반영하고(낙관적), 잠깐 모아서 한 번에 저장한다. 저장 버튼은 없다(앱 전체 규칙).
 * 가능 인원 집계와 추천 구간은 내 변경까지 포함해 즉시 다시 계산한다.
 * 글자 대신 아이콘·아바타·숫자로 말하고, 정확한 이름과 상태는 읽어 주기·툴팁으로 알려 준다.
 */
export function MeetingVote({ detail, spaceId, preview = false }: Props) {
  const router = useRouter();
  const { meeting, members, myUserId, canManage, busy } = detail;
  const polling = meeting.status === "polling";
  const memberIds = useMemo(() => members.map((m) => m.id), [members]);
  const nameOf = useMemo(() => new Map(members.map((m) => [m.id, m.name])), [members]);

  // 내 응답: 서버 값에서 시작해 내가 바꾼 것만 덮어쓴다.
  const [mine, setMine] = useState<Record<string, Answer | undefined>>(() => {
    const initial: Record<string, Answer | undefined> = {};
    for (const [day, byUser] of Object.entries(detail.votes)) if (byUser[myUserId]) initial[day] = byUser[myUserId];
    return initial;
  });
  const [pen, setPen] = useState<Pen>("yes");
  const [save, setSave] = useState<"idle" | "pending" | "saved" | "error">("idle");
  const [error, setError] = useState("");
  const [, startTransition] = useTransition();
  /** 아직 저장하지 않은 변경: 날짜 → 바뀐 응답(null 이면 지움) */
  const dirty = useRef(new Map<string, Answer | null>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const painting = useRef(false);

  const votes: Votes = useMemo(() => {
    const merged: Votes = {};
    for (const [day, byUser] of Object.entries(detail.votes)) merged[day] = { ...byUser };
    for (const [day, answer] of Object.entries(mine)) {
      const row = (merged[day] ??= {});
      if (answer) row[myUserId] = answer;
      else delete row[myUserId];
    }
    return merged;
  }, [detail.votes, mine, myUserId]);

  const ranked = useMemo(
    () => rankWindows({ windowStart: meeting.windowStart, windowEnd: meeting.windowEnd, spanDays: meeting.spanDays, memberIds, votes }),
    [meeting.windowStart, meeting.windowEnd, meeting.spanDays, memberIds, votes],
  );
  const top = ranked.filter((w) => !w.excluded).slice(0, 3);
  const bestDays = useMemo(() => new Set(top[0] && top[0].score > 0 ? top[0].days : []), [top]);

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const changes = [...dirty.current.entries()];
    dirty.current.clear();
    if (changes.length === 0) return;
    if (preview) return setSave("saved");
    setSave("pending");
    startTransition(async () => {
      // 저장에 실패하면 그 사이 새로 바꾼 날짜는 건드리지 않고 나머지만 다시 저장 대기열에 넣는다.
      const requeue = () => {
        for (const [day, answer] of changes) if (!dirty.current.has(day)) dirty.current.set(day, answer);
      };
      try {
        const result = await setMeetingResponses({ meetingId: meeting.id, answers: changes.map(([day, answer]) => ({ day, answer })) });
        if (!result.ok) {
          setSave("error");
          setError(result.message);
          requeue();
          return;
        }
        setSave("saved");
        setError("");
        router.refresh();
      } catch {
        setSave("error");
        setError("저장하지 못했어요. 연결을 확인해 주세요.");
        requeue();
      }
    });
  }, [meeting.id, preview, router]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const apply = useCallback(
    (day: string, allowToggle: boolean) => {
      if (!polling) return;
      const target = pen === "clear" ? undefined : pen;
      // 같은 값을 다시 누르면 지운다(탭으로 켜고 끄는 동작). 끌어서 지나가는 칸은 켜기만 한다.
      const value = allowToggle && target !== undefined && mine[day] === target ? undefined : target;
      setMine((current) => {
        const next = { ...current };
        if (value === undefined) delete next[day];
        else next[day] = value;
        return next;
      });
      dirty.current.set(day, value ?? null);
      setSave("pending");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, 700);
    },
    [pen, polling, mine, flush],
  );

  const weeks = useMemo(() => {
    const result: string[] = [];
    for (let cursor = startOfWeek(meeting.windowStart); cursor <= meeting.windowEnd; cursor = addDays(cursor, 7)) result.push(cursor);
    return result;
  }, [meeting.windowStart, meeting.windowEnd]);

  const respondedIds = useMemo(() => new Set(Object.values(votes).flatMap((byUser) => Object.keys(byUser))), [votes]);
  const waiting = members.filter((m) => !respondedIds.has(m.id));
  const pastDeadline = isPastDeadline(meeting.respondBy ? new Date(meeting.respondBy) : null);
  const [confirming, setConfirming] = useState<RankedWindow | null>(null);

  return (
    <div className="meeting-vote mx-auto flex w-full max-w-[84rem] flex-col gap-5 px-3 py-4 md:px-6 md:py-7">
      <header className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <Link href={`/s/${spaceId}?tab=meetings`} aria-label="일정 목록으로" title="일정 목록" className="press mt-1 grid size-10 shrink-0 place-items-center rounded-full bg-surface shadow-sm hover:bg-surface-2"><ArrowLeft className="size-5" /></Link>
          <div className="min-w-0">
            <h1 className="text-[1.65rem] font-black leading-tight tracking-tight [overflow-wrap:anywhere] md:text-3xl">{meeting.title}</h1>
            <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm font-semibold text-ink-2">
              <span className="inline-flex items-center gap-1.5"><span className="sr-only">후보 </span>{dayRangeLabel(meeting.windowStart, meeting.windowEnd)}{meeting.spanDays > 1 && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-black text-accent">{meeting.spanDays}일 연속</span>}</span>
              {meeting.location && <span className="inline-flex items-center gap-1.5 [overflow-wrap:anywhere]"><MapPin aria-hidden="true" className="size-4 shrink-0 text-ink-3" /><span className="sr-only">장소 </span>{meeting.location}</span>}
              <span className="inline-flex items-center gap-1.5 tabular-nums"><Users aria-hidden="true" className="size-4 text-ink-3" /><span className="sr-only">응답 </span>{respondedIds.size}/{members.length}</span>
              {meeting.respondBy && polling && (
                <span className={cn("inline-flex items-center gap-1.5", pastDeadline && "font-black text-warn")}>
                  <Clock aria-hidden="true" className="size-4" />
                  <span className="sr-only">{pastDeadline ? "응답 마감이 지났어요 " : "응답 마감 "}</span>
                  {new Date(meeting.respondBy).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}
                </span>
              )}
            </p>
            {meeting.memo && <p className="mt-2 max-w-2xl whitespace-pre-wrap text-sm text-ink-2 [overflow-wrap:anywhere]">{meeting.memo}</p>}
          </div>
        </div>

        {meeting.status === "confirmed" && meeting.confirmedStart && meeting.confirmedEnd && (
          <section className="flex flex-col gap-4 rounded-3xl bg-[color-mix(in_srgb,var(--ok)_14%,var(--surface))] p-5 sm:flex-row sm:items-center">
            <span aria-hidden="true" className="grid size-12 shrink-0 place-items-center rounded-full bg-ok text-white"><Check className="size-6" strokeWidth={3} /></span>
            <div className="min-w-0 flex-1">
              <p className="sr-only">확정됨</p>
              <p className="text-xl font-black leading-tight">{whenLabel(meeting.confirmedStart, meeting.confirmedEnd, meeting.confirmedFrom, meeting.confirmedTo)}</p>
            </div>
            <div className="flex flex-wrap items-start gap-2">
              {meeting.noteId && <Link href={`/s/${spaceId}/n/${meeting.noteId}`} aria-label="회의록 열기" title="회의록" className="press grid size-11 place-items-center rounded-full bg-surface shadow-sm hover:bg-surface-2"><FileText className="size-5" /></Link>}
              {canManage && <ManageButtons meetingId={meeting.id} reopen preview={preview} />}
            </div>
          </section>
        )}
        {meeting.status === "cancelled" && <p className="rounded-2xl bg-surface-2 p-4 text-sm font-bold text-ink-2">취소된 모임이에요.</p>}
      </header>

      {polling && (
        <div className="flex flex-wrap items-center gap-3" role="group" aria-label="내 응답 칠하기">
          <div className="inline-flex gap-1.5 rounded-full bg-surface p-1.5 shadow-sm">
            {PENS.map((p) => {
              const Icon = p.icon;
              return (
                <button
                  key={p.value}
                  type="button"
                  aria-pressed={pen === p.value}
                  aria-label={p.label}
                  title={p.label}
                  onClick={() => setPen(p.value)}
                  className={cn("press grid size-11 place-items-center rounded-full transition-all", pen === p.value ? cn(p.on, "scale-105 shadow-md ring-2 ring-offset-2 ring-offset-surface") : "text-ink-2 hover:bg-surface-2")}
                >
                  <Icon className={cn("size-5", p.value === "maybe" && "size-4 fill-current")} strokeWidth={p.value === "maybe" ? 2.2 : 2.8} />
                </button>
              );
            })}
          </div>
          {canManage && <div className="ml-auto order-last sm:order-none"><ManageButtons meetingId={meeting.id} preview={preview} /></div>}
          <span role="status" aria-live="polite" className={cn("inline-flex items-center gap-1.5 text-sm font-semibold", save === "error" ? "text-danger" : "text-ink-3")}>
            {save === "pending" && <><LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" /><span className="sr-only">저장 중</span></>}
            {save === "saved" && <><Check aria-hidden="true" className="size-4 text-ok" /><span className="sr-only">저장됐어요</span></>}
            {save === "error" && <><CircleAlert aria-hidden="true" className="size-4" />{error}</>}
          </span>
        </div>
      )}
      {error && save !== "error" && <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-2.5 text-sm font-semibold text-danger">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="min-w-0 overflow-hidden rounded-3xl bg-surface p-2 shadow-sm md:p-4">
          <div role="grid" aria-label="후보 날짜" onPointerUp={() => { painting.current = false; }} onPointerLeave={() => { painting.current = false; }} className="select-none">
            <div role="row" className="grid grid-cols-7 gap-1 text-center text-xs font-bold text-ink-3">
              {WEEKDAYS.map((w, index) => <div key={w} role="columnheader" className={cn("pb-1.5 pt-1", index === 0 && "text-danger/80")}>{w}</div>)}
            </div>
            <div className="flex flex-col gap-1">
              {weeks.map((weekStart) => (
                <div key={weekStart} role="row" className="grid grid-cols-7 gap-1">
                  {weekDays(weekStart).map((day) => {
                    const inWindow = day >= meeting.windowStart && day <= meeting.windowEnd;
                    if (!inWindow) {
                      return <div key={day} role="gridcell" aria-disabled="true" className="grid min-h-[4.5rem] place-items-start rounded-2xl p-2 text-sm font-medium text-ink-3/70 md:min-h-[6.25rem]">{Number(day.slice(8))}</div>;
                    }
                    const tally = tallyDay(votes, day, memberIds);
                    const heat = heatLevel(tally, memberIds.length);
                    const my = mine[day];
                    const MyIcon = my ? MARK[my].icon : null;
                    const best = bestDays.has(day);
                    const conflict = busy[day];
                    return (
                      <button
                        key={day}
                        type="button"
                        role="gridcell"
                        disabled={!polling}
                        title={`${shortDay(day)} · 가능 ${tally.yes} 조건부 ${tally.maybe} 불가 ${tally.no} 미응답 ${tally.none}`}
                        aria-label={`${shortDay(day)}, 가능 ${tally.yes}명 조건부 ${tally.maybe}명 불가 ${tally.no}명 미응답 ${tally.none}명, 내 응답 ${my ? MARK[my].label : "없음"}${conflict ? `, 내 일정 ${conflict.join(", ")}과 겹침` : ""}`}
                        onPointerDown={(event) => {
                          // 마우스로만 끌어서 칠한다. 터치는 스크롤과 겹치므로 탭만 쓴다.
                          painting.current = event.pointerType === "mouse";
                          apply(day, true);
                        }}
                        onPointerEnter={(event) => {
                          if (painting.current && event.buttons === 1) apply(day, false);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            apply(day, true);
                          }
                        }}
                        style={{ backgroundColor: heat > 0 ? `color-mix(in srgb, var(--ok) ${Math.round(8 + heat * 30)}%, var(--surface))` : "var(--surface-2)" }}
                        className={cn(
                          "relative flex min-h-[4.5rem] min-w-0 flex-col justify-between rounded-2xl p-2 text-left transition-shadow md:min-h-[6.25rem] md:p-3",
                          "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:cursor-default",
                          best && "z-[1] shadow-[0_0_0_3px_var(--accent)]",
                        )}
                      >
                        <span className="flex items-start justify-between gap-1">
                          <span className="text-sm font-bold tabular-nums">{Number(day.slice(8))}</span>
                          {MyIcon && my ? (
                            <span aria-hidden="true" className={cn("grid size-5 place-items-center rounded-full md:size-6", MARK[my].chip)}>
                              <MyIcon className={cn("size-3 md:size-3.5", my === "maybe" && "size-2.5 fill-current md:size-3")} strokeWidth={3} />
                            </span>
                          ) : (
                            conflict && <span aria-hidden="true" className="mt-1 size-2 rounded-full bg-warn" />
                          )}
                        </span>
                        <span className="flex items-end justify-between gap-1">
                          <span className="font-mono text-[1.35rem] font-black leading-none tabular-nums md:text-[1.75rem]">{tally.yes}<span className="text-xs font-bold text-ink-3 max-md:hidden">/{memberIds.length}</span></span>
                          {best && <Sparkles aria-hidden="true" className="size-4 text-accent md:size-5" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>

        <aside className="flex min-w-0 flex-col gap-3">
          <section className="flex flex-col gap-3 rounded-3xl bg-surface p-4 shadow-sm md:p-5" aria-label="추천 구간">
            <h2 className="flex items-center gap-2 text-sm font-black text-ink-2">
              <Sparkles aria-hidden="true" className="size-4 text-accent" />
              <span className="sr-only">추천</span>
              {meeting.spanDays > 1 ? `${meeting.spanDays}일 연속` : "하루"}
            </h2>
            {top.length === 0 || top[0].score === 0 ? (
              <p className="py-4 text-center text-sm text-ink-3">날짜를 칠하면 추천이 나와요</p>
            ) : (
              <ol className="flex flex-col gap-2.5">
                {top.map((w, index) => (
                  <li key={w.start} className={cn("flex flex-col gap-3 rounded-2xl p-3.5", index === 0 ? "bg-accent-soft" : "bg-surface-2/70")}>
                    <div className="flex items-end justify-between gap-2">
                      <p className="text-[1.65rem] font-black leading-none tabular-nums tracking-tight">
                        {Number(w.start.slice(8))}{w.start !== w.end && <span className="text-ink-3">–</span>}{w.start !== w.end && Number(w.end.slice(8))}
                        <span className="ml-1.5 text-sm font-bold text-ink-2">{Number(w.start.slice(5, 7))}월 {weekdayLabel(w.start)}{w.start !== w.end && `–${weekdayLabel(w.end)}`}</span>
                      </p>
                      <p className="inline-flex shrink-0 items-center gap-1 text-sm font-black tabular-nums text-ok" aria-label={`가능 ${w.yes.length}명 중 ${members.length}명`}><Check aria-hidden="true" className="size-4" strokeWidth={3} />{w.yes.length}/{members.length}</p>
                    </div>
                    <MemberStack members={members} status={(id) => (w.yes.includes(id) ? "yes" : w.maybe.includes(id) ? "maybe" : w.no.includes(id) ? "no" : "none")} />
                    <span className="sr-only">
                      {w.no.length > 0 && `불가: ${w.no.map((id) => nameOf.get(id)).join(", ")} `}
                      {w.none.length > 0 && `미응답: ${w.none.map((id) => nameOf.get(id)).join(", ")}`}
                    </span>
                    {polling && canManage && (
                      <button type="button" aria-label="이 구간으로 확정" onClick={() => setConfirming(w)} className="press inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-accent px-4 text-sm font-black text-on-accent shadow-sm hover:brightness-105">
                        <Check className="size-4" strokeWidth={3} aria-hidden="true" />확정
                      </button>
                    )}
                  </li>
                ))}
              </ol>
            )}
            {polling && !canManage && <p className="text-center text-xs text-ink-3">확정은 만든 사람이나 스페이스 소유자가 해요.</p>}
          </section>

          {waiting.length > 0 && polling && (
            <section className="flex items-center gap-3 rounded-3xl bg-surface p-4 shadow-sm" aria-label="아직 응답하지 않은 사람">
              <Hourglass aria-hidden="true" className="size-5 shrink-0 text-ink-3" />
              <span className="sr-only">아직 응답하지 않은 사람</span>
              <MemberStack members={waiting} status={() => "yes"} />
            </section>
          )}

        </aside>
      </div>

      {confirming && (
        <ConfirmSheet window={confirming} meetingId={meeting.id} members={members} votes={votes} preview={preview} onClose={() => setConfirming(null)} />
      )}
    </div>
  );
}

function ManageButtons({ meetingId, reopen = false, preview }: { meetingId: string; reopen?: boolean; preview: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  function run(action: (id: string) => Promise<{ ok: boolean; message?: string }>) {
    if (preview) return;
    setMessage("");
    startTransition(async () => {
      try {
        const result = await action(meetingId);
        if (!result.ok) setMessage(result.message ?? "처리하지 못했어요.");
        else router.refresh();
      } catch {
        setMessage("처리하지 못했어요. 연결을 확인해 주세요.");
      }
    });
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {reopen && (
          <button type="button" aria-label="다시 조사하기" title="다시 조사하기" disabled={pending} onClick={() => run(reopenMeeting)} className="press grid size-11 place-items-center rounded-full bg-surface shadow-sm hover:bg-surface-2 disabled:opacity-50"><RotateCcw className="size-5" /></button>
        )}
        {!confirmCancel && (
          <button type="button" aria-label="모임 취소" title="모임 취소" disabled={pending} onClick={() => setConfirmCancel(true)} className="press grid size-11 place-items-center rounded-full bg-danger-soft text-danger hover:brightness-95 disabled:opacity-50"><Trash2 className="size-5" /></button>
        )}
      </div>
      {confirmCancel && (
        <div role="alertdialog" aria-label="모임 취소 확인" className="rounded-2xl bg-danger-soft p-3">
          <p className="flex items-center gap-2 text-sm font-bold text-danger"><CircleAlert aria-hidden="true" className="size-4 shrink-0" />이 모임을 취소할까요?</p>
          <div className="mt-2.5 flex gap-2">
            <button type="button" disabled={pending} onClick={() => run(cancelMeeting)} className="press inline-flex h-10 items-center rounded-full bg-danger px-4 text-sm font-black text-on-accent">취소하기</button>
            <button type="button" onClick={() => setConfirmCancel(false)} className="press inline-flex h-10 items-center rounded-full bg-surface px-4 text-sm font-bold shadow-sm">돌아가기</button>
          </div>
        </div>
      )}
      {message && <p role="alert" className="text-sm font-semibold text-danger">{message}</p>}
    </div>
  );
}

function ConfirmSheet({ window: w, meetingId, members, votes, preview, onClose }: { window: RankedWindow; meetingId: string; members: MeetingMember[]; votes: Votes; preview: boolean; onClose: () => void }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [createNote, setCreateNote] = useState(true);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const status = (id: string) => windowStatus(votes, id, w.days);
  const attention = members.filter((m) => status(m.id) !== "yes");
  function submit() {
    setError("");
    if ((from === "") !== (to === "")) return setError("시작과 종료 시각을 함께 정해 주세요.");
    if (preview) return onClose();
    startTransition(async () => {
      try {
        const result = await confirmMeeting({ meetingId, start: w.start, from: from || null, to: to || null, createNote });
        if (!result.ok) return setError(result.message);
        onClose();
        router.refresh();
      } catch {
        setError("확정하지 못했어요. 연결을 확인해 주세요.");
      }
    });
  }
  const field = "h-12 w-full rounded-2xl bg-surface-2 px-3 text-[15px] font-semibold tabular-nums focus:outline-2 focus:outline-accent";
  return (
    <dialog ref={dialog} onCancel={(event) => { event.preventDefault(); onClose(); }} aria-labelledby="confirm-title" className="m-auto w-[25rem] max-w-[calc(100%-1.5rem)] rounded-[2rem] border-0 bg-surface p-0 text-ink shadow-[var(--shadow-float)] backdrop:bg-ink/40 backdrop:backdrop-blur-sm">
      <div className="flex flex-col gap-5 p-6">
        <div className="flex items-start justify-between gap-3">
          <h2 id="confirm-title" className="text-2xl font-black leading-tight tracking-tight">{dayRangeLabel(w.start, w.end)}</h2>
          <button type="button" aria-label="닫기" onClick={onClose} disabled={pending} className="press grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 hover:bg-line"><X className="size-4" /></button>
        </div>
        {attention.length > 0 && (
          <div className="flex flex-col gap-2 rounded-2xl bg-warn-soft p-3">
            <MemberStack members={attention} status={status} />
            <p className="sr-only">
              아직 답하지 않았거나 참석이 어려운 사람:{" "}
              {attention.map((m) => `${m.name} ${status(m.id) === "none" ? "아직 답하지 않은 사람" : status(m.id) === "no" ? "참석이 어려운 사람" : "조건부"}`).join(", ")}
            </p>
          </div>
        )}
        <div className="grid grid-cols-[auto_1fr_auto_1fr] items-center gap-2">
          <Clock aria-hidden="true" className="size-5 text-ink-3" />
          <input type="time" aria-label="시작 시각" value={from} onChange={(e) => setFrom(e.target.value)} className={field} />
          <span aria-hidden="true" className="text-ink-3">–</span>
          <input type="time" aria-label="종료 시각" value={to} onChange={(e) => setTo(e.target.value)} className={field} />
        </div>
        <label className="flex cursor-pointer items-center gap-3 rounded-2xl bg-surface-2 p-3">
          <FileText aria-hidden="true" className="size-5 text-ink-3" />
          <span className="flex-1 text-sm font-bold">회의록</span>
          <input type="checkbox" checked={createNote} onChange={(e) => setCreateNote(e.target.checked)} className="size-5 accent-[var(--accent)]" aria-label="회의록 노트를 함께 만들기" />
        </label>
        {error && <p role="alert" className="flex items-center gap-2 text-sm font-semibold text-danger"><CircleAlert aria-hidden="true" className="size-4 shrink-0" />{error}</p>}
        <button type="button" aria-label="확정하기" onClick={submit} disabled={pending} className="press inline-flex h-13 items-center justify-center gap-2 rounded-full bg-accent text-base font-black text-on-accent shadow-md hover:brightness-105 disabled:opacity-50">
          {pending ? <LoaderCircle aria-hidden="true" className="size-5 animate-spin motion-reduce:animate-none" /> : <Check aria-hidden="true" className="size-5" strokeWidth={3} />}
          확정
        </button>
        <p className="sr-only">확정하면 스페이스 채팅에 공지가 올라가고, 모든 멤버의 캘린더에 나타나요.</p>
      </div>
    </dialog>
  );
}
