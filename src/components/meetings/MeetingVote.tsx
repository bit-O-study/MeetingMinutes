"use client";

import Link from "@/components/PendingLink";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";

import { cancelMeeting, confirmMeeting, reopenMeeting, setMeetingResponses } from "@/lib/actions/meetings";
import { addDays, dayRangeLabel, shortDay, startOfWeek } from "@/lib/calendar-dates";
import { weekDays } from "@/lib/calendar-layout";
import { heatLevel, isPastDeadline, lastStartDay, rankWindows, tallyDay, type Answer, type RankedWindow, type Votes } from "@/lib/meetings";
import type { MeetingDetail } from "@/lib/meeting-data";
import { cn } from "@/lib/utils";

type Props = { detail: MeetingDetail; spaceId: string; preview?: boolean };

const PENS: { value: Answer | "clear"; label: string; mark: string; on: string }[] = [
  { value: "yes", label: "가능", mark: "●", on: "border-ok bg-ok-soft text-ok" },
  { value: "maybe", label: "조건부", mark: "◆", on: "border-warn bg-warn-soft text-warn" },
  { value: "no", label: "불가", mark: "✕", on: "border-ink-2 bg-surface-2 text-ink" },
  { value: "clear", label: "지우기", mark: "○", on: "border-ink-2 bg-surface-2 text-ink" },
];
const MARK: Record<Answer, { mark: string; label: string; cls: string }> = {
  yes: { mark: "●", label: "가능", cls: "bg-ok-soft text-ok" },
  maybe: { mark: "◆", label: "조건부", cls: "bg-warn-soft text-warn" },
  no: { mark: "✕", label: "불가", cls: "bg-surface-2 text-ink-3" },
};
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function whenLabel(start: string, end: string, from: string | null, to: string | null) {
  return `${dayRangeLabel(start, end)}${from && to ? ` ${from}–${to}` : ""}`;
}

/**
 * 모임 일정 투표. 후보 기간의 날짜를 캘린더에서 칠해 가능·조건부·불가를 낸다.
 *
 * 내 응답은 바로 화면에 반영하고(낙관적), 잠깐 모아서 한 번에 저장한다. 저장 버튼은 없다(앱 전체 규칙).
 * 가능 인원 집계와 추천 구간은 내 변경까지 포함해 즉시 다시 계산한다.
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
  const [pen, setPen] = useState<Answer | "clear">("yes");
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
  const lastStart = lastStartDay(meeting.windowEnd, meeting.spanDays);

  const [confirming, setConfirming] = useState<RankedWindow | null>(null);

  return (
    <div className="mx-auto flex w-full max-w-[84rem] flex-col gap-4 px-3 py-4 md:px-5 md:py-6">
      <div>
        <Link href={`/s/${spaceId}?tab=meetings`} className="text-sm font-bold text-ink-2 hover:text-ink">← 일정 목록</Link>
        <h1 className="mt-1 text-2xl font-black tracking-tight md:text-[1.75rem]">{meeting.title}</h1>
        <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-ink-2">
          <span>후보 {dayRangeLabel(meeting.windowStart, meeting.windowEnd)}</span>
          {meeting.spanDays > 1 && <span>연속 {meeting.spanDays}일</span>}
          {meeting.location && <span>장소 {meeting.location}</span>}
          <span>응답 {respondedIds.size}/{members.length}명</span>
          {meeting.respondBy && polling && (
            <span className={cn(pastDeadline && "font-bold text-warn")}>
              {pastDeadline ? "응답 마감이 지났어요" : `응답 마감 ${new Date(meeting.respondBy).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}`}
            </span>
          )}
        </p>
        {meeting.memo && <p className="mt-2 max-w-3xl whitespace-pre-wrap text-sm text-ink-2 [overflow-wrap:anywhere]">{meeting.memo}</p>}
      </div>

      {meeting.status === "confirmed" && meeting.confirmedStart && meeting.confirmedEnd && (
        <section className="flex flex-col gap-3 rounded-2xl bg-ok-soft p-4 ring-1 ring-ok sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-ok">확정됨</p>
            <p className="text-lg font-black">{whenLabel(meeting.confirmedStart, meeting.confirmedEnd, meeting.confirmedFrom, meeting.confirmedTo)}</p>
          </div>
          <div className="flex flex-wrap items-start gap-2">
            {meeting.noteId && <Link href={`/s/${spaceId}/n/${meeting.noteId}`} className="press inline-flex h-10 items-center rounded-xl bg-surface px-3.5 text-sm font-bold ring-1 ring-inset ring-line">회의록 열기</Link>}
            {canManage && <ManageButtons meetingId={meeting.id} reopen preview={preview} />}
          </div>
        </section>
      )}
      {meeting.status === "cancelled" && <p className="rounded-2xl bg-surface-2 p-4 text-sm font-bold text-ink-2">취소된 모임이에요.</p>}

      {polling && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2" role="group" aria-label="내 응답 칠하기">
          <span className="text-sm font-bold">내 응답</span>
          <div className="flex flex-wrap gap-2">
            {PENS.map((p) => (
              <button
                key={p.value}
                type="button"
                aria-pressed={pen === p.value}
                onClick={() => setPen(p.value)}
                className={cn("inline-flex min-h-10 items-center gap-2 rounded-xl border-[1.5px] px-3.5 text-sm font-bold", pen === p.value ? p.on : "border-line-2 bg-surface text-ink-2")}
              >
                <span aria-hidden="true">{p.mark}</span>{p.label}
              </button>
            ))}
          </div>
          <span className="text-[13px] text-ink-2">날짜를 누르거나 끌어서 칠해요. 같은 값을 다시 누르면 지워져요.</span>
          <span role="status" className={cn("ml-auto text-[13px]", save === "error" ? "font-bold text-danger" : "text-ink-3")}>
            {save === "pending" ? "저장 중…" : save === "saved" ? "저장됐어요" : save === "error" ? error : ""}
          </span>
        </div>
      )}
      {error && save !== "error" && <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="min-w-0 overflow-hidden rounded-2xl bg-surface ring-1 ring-line">
          <div role="grid" aria-label="후보 날짜" onPointerUp={() => { painting.current = false; }} onPointerLeave={() => { painting.current = false; }} className="select-none px-2 py-2 md:px-3">
            <div role="row" className="grid grid-cols-7 text-center text-[13px] font-bold text-ink-3">
              {WEEKDAYS.map((w) => <div key={w} role="columnheader" className="py-1.5">{w}</div>)}
            </div>
            {weeks.map((weekStart) => (
              <div key={weekStart} role="row" className="grid grid-cols-7 gap-1 pb-1">
                {weekDays(weekStart).map((day) => {
                  const inWindow = day >= meeting.windowStart && day <= meeting.windowEnd;
                  if (!inWindow) {
                    return <div key={day} role="gridcell" aria-disabled="true" className="min-h-[4.5rem] rounded-lg bg-surface-2/60 p-1.5 text-sm font-medium text-ink-3 md:min-h-[6rem] md:p-2">{Number(day.slice(8))}</div>;
                  }
                  const tally = tallyDay(votes, day, memberIds);
                  const heat = heatLevel(tally, memberIds.length);
                  const my = mine[day];
                  const best = bestDays.has(day);
                  const startable = day <= lastStart;
                  const conflict = busy[day];
                  return (
                    <button
                      key={day}
                      type="button"
                      role="gridcell"
                      disabled={!polling}
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
                      style={{ backgroundColor: `color-mix(in srgb, var(--ok) ${Math.round(heat * 30)}%, var(--surface-2))` }}
                      className={cn(
                        "relative flex min-h-[4.5rem] min-w-0 flex-col items-stretch gap-1 rounded-lg p-1.5 text-left md:min-h-[6rem] md:p-2",
                        "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:cursor-default",
                        best && "outline outline-[3px] -outline-offset-[3px] outline-accent",
                        !startable && "opacity-90",
                      )}
                    >
                      <span className="flex items-baseline justify-between gap-1">
                        <span className="text-sm font-bold">{Number(day.slice(8))}</span>
                        <span className="font-mono text-[13px] font-bold">{tally.yes}<span className="max-md:hidden">/{memberIds.length}</span></span>
                      </span>
                      <span aria-hidden="true" className="hidden flex-wrap gap-[3px] md:flex">
                        {memberIds.map((id) => {
                          const a = votes[day]?.[id];
                          return <i key={id} className={cn("block size-[11px]", a === "yes" && "rounded-full bg-ok", a === "maybe" && "rotate-45 rounded-[3px] bg-warn", a !== "yes" && a !== "maybe" && "rounded-full bg-line-2")} />;
                        })}
                      </span>
                      <span className={cn("mt-auto inline-flex w-fit items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-bold md:text-xs", my ? MARK[my].cls : "text-ink-3")}>
                        <span aria-hidden="true">{my ? MARK[my].mark : "·"}</span>
                        <span className="max-md:sr-only">{my ? MARK[my].label : "미응답"}</span>
                      </span>
                      {conflict && <span className="hidden text-[11px] font-medium text-warn md:block">내 일정 · {conflict[0]}{conflict.length > 1 ? ` 외 ${conflict.length - 1}` : ""}</span>}
                      {conflict && <span aria-hidden="true" className="absolute right-1 top-1 size-1.5 rounded-full bg-warn md:hidden" />}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-line px-4 py-3 text-[13px] text-ink-2">
            <span className="inline-flex items-center gap-1.5"><i aria-hidden="true" className="size-3 rounded-full bg-ok" />가능</span>
            <span className="inline-flex items-center gap-1.5"><i aria-hidden="true" className="size-3 rotate-45 rounded-[3px] bg-warn" />조건부</span>
            <span className="inline-flex items-center gap-1.5"><i aria-hidden="true" className="size-3 rounded-full bg-line-2" />불가·미응답</span>
            <span>칸이 진할수록 가능한 사람이 많아요</span>
            <span className="inline-flex items-center gap-1.5 md:ml-auto"><i aria-hidden="true" className="h-3.5 w-5 rounded border-[3px] border-accent" />추천 구간</span>
          </div>
        </div>

        <aside className="flex min-w-0 flex-col gap-3">
          <section className="rounded-2xl bg-surface p-4 ring-1 ring-line" aria-label="추천 구간">
            <p className="font-mono text-xs font-medium tracking-wide text-accent">추천</p>
            <h2 className="mb-3 text-xl font-black">{meeting.spanDays > 1 ? `연속 ${meeting.spanDays}일` : "하루"}</h2>
            {top.length === 0 || top[0].score === 0 ? (
              <p className="text-sm text-ink-2">아직 가능하다고 답한 날이 없어요. 날짜를 칠해 주세요.</p>
            ) : (
              <ol className="flex flex-col gap-2">
                {top.map((w, index) => (
                  <li key={w.start} className={cn("rounded-xl p-3 ring-1", index === 0 ? "bg-accent-soft ring-accent" : "bg-surface ring-line")}>
                    <p className="text-base font-black">{dayRangeLabel(w.start, w.end)}</p>
                    <p className="mt-0.5 text-[13px] text-ink-2">
                      {meeting.spanDays > 1 ? "모든 날 가능한 사람" : "가능한 사람"} {w.yes.length}/{members.length}명
                      {w.maybe.length > 0 && ` · 조건부 ${w.maybe.length}명`}
                    </p>
                    {w.no.length > 0 && <p className="text-[13px] text-ink-2">불가: {w.no.map((id) => nameOf.get(id)).join(", ")}</p>}
                    {w.none.length > 0 && <p className="text-[13px] text-ink-2">미응답: {w.none.map((id) => nameOf.get(id)).join(", ")}</p>}
                    {polling && canManage && (
                      <button type="button" onClick={() => setConfirming(w)} className="press mt-2 inline-flex h-9 w-full items-center justify-center rounded-xl bg-accent px-3 text-sm font-bold text-on-accent">이 구간으로 확정</button>
                    )}
                  </li>
                ))}
              </ol>
            )}
            {polling && !canManage && <p className="mt-3 text-[13px] text-ink-3">확정은 만든 사람이나 스페이스 소유자가 해요.</p>}
          </section>

          {waiting.length > 0 && polling && (
            <section className="rounded-2xl bg-surface p-4 ring-1 ring-line" aria-label="아직 응답하지 않은 사람">
              <h3 className="text-sm font-black">아직 응답하지 않은 사람</h3>
              <p className="mt-1.5 flex flex-wrap gap-1.5">{waiting.map((m) => <span key={m.id} className="rounded-full bg-surface-2 px-2.5 py-1 text-[13px]">{m.name}</span>)}</p>
            </section>
          )}

          {polling && canManage && (
            <section className="rounded-2xl bg-surface p-4 ring-1 ring-line" aria-label="모임 관리">
              <h3 className="mb-2 text-sm font-black">모임 관리</h3>
              <ManageButtons meetingId={meeting.id} preview={preview} />
            </section>
          )}
        </aside>
      </div>

      {confirming && (
        <ConfirmSheet
          window={confirming}
          meetingId={meeting.id}
          spaceId={spaceId}
          nameOf={nameOf}
          preview={preview}
          onClose={() => setConfirming(null)}
        />
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
        {reopen && <button type="button" disabled={pending} onClick={() => run(reopenMeeting)} className="press inline-flex h-10 items-center rounded-xl bg-surface px-3.5 text-sm font-bold ring-1 ring-inset ring-line disabled:opacity-50">다시 조사하기</button>}
        {!confirmCancel && <button type="button" disabled={pending} onClick={() => setConfirmCancel(true)} className="press inline-flex h-10 items-center rounded-xl bg-danger-soft px-3.5 text-sm font-bold text-danger disabled:opacity-50">모임 취소</button>}
      </div>
      {confirmCancel && (
        <div role="alertdialog" aria-label="모임 취소 확인" className="rounded-xl bg-danger-soft p-3 text-sm">
          <p className="font-bold text-danger">이 모임을 취소할까요? 응답은 남지만 되돌릴 수 없어요.</p>
          <div className="mt-2 flex gap-2">
            <button type="button" disabled={pending} onClick={() => run(cancelMeeting)} className="press inline-flex h-9 items-center rounded-lg bg-danger px-3 text-sm font-bold text-on-accent">취소하기</button>
            <button type="button" onClick={() => setConfirmCancel(false)} className="press inline-flex h-9 items-center rounded-lg bg-surface px-3 text-sm font-bold ring-1 ring-inset ring-line">돌아가기</button>
          </div>
        </div>
      )}
      {message && <p role="alert" className="text-sm text-danger">{message}</p>}
    </div>
  );
}

function ConfirmSheet({ window: w, meetingId, spaceId, nameOf, preview, onClose }: { window: RankedWindow; meetingId: string; spaceId: string; nameOf: Map<string, string>; preview: boolean; onClose: () => void }) {
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
        void spaceId;
      } catch {
        setError("확정하지 못했어요. 연결을 확인해 주세요.");
      }
    });
  }
  const names = (ids: string[]) => ids.map((id) => nameOf.get(id)).join(", ");
  return (
    <dialog ref={dialog} onCancel={(event) => { event.preventDefault(); onClose(); }} aria-labelledby="confirm-title" className="m-auto w-[26rem] max-w-[calc(100%-1.5rem)] rounded-3xl border border-line bg-surface p-0 text-ink shadow-xl backdrop:bg-ink/45">
      <div className="flex flex-col gap-4 p-5">
        <div>
          <p className="font-mono text-xs font-medium tracking-wide text-accent">확정하기</p>
          <h2 id="confirm-title" className="text-xl font-black">{dayRangeLabel(w.start, w.end)}</h2>
        </div>
        {(w.no.length > 0 || w.none.length > 0 || w.maybe.length > 0) && (
          <div className="rounded-xl bg-warn-soft p-3 text-sm">
            {w.no.length > 0 && <p><b>참석이 어려운 사람</b> {names(w.no)}</p>}
            {w.none.length > 0 && <p><b>아직 답하지 않은 사람</b> {names(w.none)}</p>}
            {w.maybe.length > 0 && <p><b>조건부</b> {names(w.maybe)}</p>}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-[13px] font-bold">시작 시각 <span className="font-normal text-ink-3">선택</span>
            <input type="time" value={from} onChange={(e) => setFrom(e.target.value)} className="h-11 rounded-xl bg-surface px-3 text-[15px] font-normal ring-1 ring-inset ring-line" />
          </label>
          <label className="flex flex-col gap-1 text-[13px] font-bold">종료 시각 <span className="font-normal text-ink-3">선택</span>
            <input type="time" value={to} onChange={(e) => setTo(e.target.value)} className="h-11 rounded-xl bg-surface px-3 text-[15px] font-normal ring-1 ring-inset ring-line" />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={createNote} onChange={(e) => setCreateNote(e.target.checked)} className="size-4 accent-[var(--accent)]" />회의록 노트를 함께 만들기</label>
        <p className="text-[13px] text-ink-2">확정하면 스페이스 채팅에 공지가 올라가고, 모든 멤버의 캘린더에 나타나요.</p>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={pending} className="press inline-flex h-11 items-center rounded-2xl bg-surface px-4 text-sm font-bold ring-1 ring-inset ring-line">닫기</button>
          <button type="button" onClick={submit} disabled={pending} className="press inline-flex h-11 items-center rounded-2xl bg-accent px-5 text-sm font-bold text-on-accent disabled:opacity-50">{pending ? "확정하는 중…" : "확정하기"}</button>
        </div>
      </div>
    </dialog>
  );
}
