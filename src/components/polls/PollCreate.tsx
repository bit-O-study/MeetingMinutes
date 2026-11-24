"use client";

import { ChevronLeft, ChevronRight, CircleAlert, Clock, LoaderCircle, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { buttonClass, fieldClass } from "@/components/ui/Button";
import { createPoll } from "@/lib/actions/polls";
import { addDays, daysInclusive, eachDay, weekday } from "@/lib/calendar-dates";
import { dayLabel, deadlineLabel, seoulEvening } from "@/lib/poll-format";
import { MAX_POLL_DAYS, remainingLabel, seoulLocalToIso } from "@/lib/polls";
import { cn } from "@/lib/utils";

import { HATCH, MonthGrids } from "./MonthGrids";
import { useNow } from "./useNow";

type DeadlineKind = "none" | "d1" | "d3" | "d7" | "custom";
const DEADLINE_CHIPS: { kind: DeadlineKind; label: string }[] = [
  { kind: "none", label: "마감 없음" },
  { kind: "d1", label: "내일 18:00" },
  { kind: "d3", label: "3일 뒤 18:00" },
  { kind: "d7", label: "1주 뒤 18:00" },
  { kind: "custom", label: "직접 설정" },
];

const CARD = "flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5 sm:p-6";

function lastDayOf(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
}

function monthShift(month: string, offset: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + offset, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function PollCreate({ today }: { today: string }) {
  const router = useRouter();
  const now = useNow();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [start, setStart] = useState(addDays(today, 1));
  const [end, setEnd] = useState(addDays(today, 14));
  const [picking, setPicking] = useState(false);
  const [mode, setMode] = useState<"range" | "exclude">("range");
  const [excluded, setExcluded] = useState<Record<string, string>>({});
  const [visible, setVisible] = useState(addDays(today, 1).slice(0, 7));
  const [kind, setKind] = useState<DeadlineKind>("d3");
  const [customDate, setCustomDate] = useState(addDays(today, 3));
  const [customTime, setCustomTime] = useState("18:00");
  const [visibility, setVisibility] = useState<"participants" | "owner">("participants");

  const length = daysInclusive(start, end);
  const excludedDays = useMemo(() => Object.keys(excluded).filter((d) => d >= start && d <= end).sort(), [excluded, start, end]);
  const candidates = length - excludedDays.length;
  const weekends = useMemo(() => eachDay(start, end).filter((d) => weekday(d) === 0 || weekday(d) === 6), [start, end]);
  const weekendsOut = weekends.length > 0 && weekends.every((d) => d in excluded);

  const localDeadline = kind === "none" ? null
    : kind === "d1" ? seoulEvening(today, 1)
    : kind === "d3" ? seoulEvening(today, 3)
    : kind === "d7" ? seoulEvening(today, 7)
    : customDate && customTime ? `${customDate}T${customTime}` : "";
  const deadlineIso = localDeadline ? seoulLocalToIso(localDeadline) : null;

  /** 마감 안내: 문구와 톤. now 가 없을 때(서버 렌더)는 시각 비교를 하지 않는다. */
  const deadlineNote = (() => {
    if (kind === "none") return { tone: "neutral" as const, head: "마감 시각 없이 열어 둬요", sub: "직접 마감하거나 날짜를 확정하기 전까지 응답을 받아요." };
    if (!deadlineIso) return { tone: "danger" as const, head: "날짜와 시간을 입력해 주세요", sub: "입력하기 전에는 투표를 만들 수 없어요." };
    const at = new Date(deadlineIso);
    const head = `${deadlineLabel(deadlineIso)}에 마감`;
    if (now && at.getTime() <= now.getTime()) return { tone: "danger" as const, head: `${deadlineLabel(deadlineIso)}은 이미 지났어요`, sub: "지금보다 뒤의 시각을 골라 주세요." };
    const left = now ? remainingLabel(at, now) : null;
    if (localDeadline && localDeadline.slice(0, 10) >= start) {
      return { tone: "warn" as const, head, sub: `${left ?? ""} · 후보 첫날(${dayLabel(start)}) 이후예요. 날짜가 지난 뒤에도 투표를 받게 돼요.`.replace(/^ · /, "") };
    }
    return { tone: "ok" as const, head, sub: `${left ?? ""} · 마감 뒤에는 응답을 받지 않아요. 만든 사람은 마감을 연장할 수 있어요.`.replace(/^ · /, "") };
  })();
  const blocked = deadlineNote.tone === "danger" || candidates < 1 || !title.trim();

  function onDay(day: string) {
    if (mode === "range") {
      if (!picking) {
        setStart(day); setEnd(day); setPicking(true);
        return;
      }
      const a = day < start ? day : start;
      const b = day < start ? start : day;
      if (daysInclusive(a, b) > MAX_POLL_DAYS) {
        setError(`후보 기간은 ${MAX_POLL_DAYS}일까지예요.`);
        return;
      }
      setError("");
      setStart(a); setEnd(b); setPicking(false);
      // 기간 밖으로 밀려난 제외일은 버린다.
      setExcluded((prev) => Object.fromEntries(Object.entries(prev).filter(([d]) => d >= a && d <= b)));
      return;
    }
    if (day < start || day > end) return;
    setExcluded((prev) => {
      const next = { ...prev };
      if (day in next) delete next[day]; else next[day] = "";
      return next;
    });
  }

  function toggleWeekends() {
    setExcluded((prev) => {
      const next = { ...prev };
      for (const d of weekends) { if (weekendsOut) delete next[d]; else if (!(d in next)) next[d] = ""; }
      return next;
    });
  }

  function submit() {
    setError("");
    if (!title.trim()) return setError("제목을 입력해 주세요.");
    startTransition(async () => {
      const result = await createPoll({
        title,
        description,
        rangeStart: start,
        rangeEnd: end,
        excluded: excludedDays.map((day) => ({ day, reason: excluded[day] ?? "" })),
        respondBy: deadlineIso,
        resultVisibility: visibility,
      });
      if (!result.ok) return setError(result.message);
      router.push(`/polls/${result.id}?created=1`);
    });
  }

  const toneClass = {
    ok: "bg-ok-soft text-ok", warn: "bg-warn-soft text-warn", danger: "bg-danger-soft text-danger", neutral: "bg-surface-2 text-ink-2",
  }[deadlineNote.tone];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <header>
        <h1 className="text-2xl font-bold text-ink">새 일정 투표</h1>
        <p className="mt-1 text-sm text-ink-2">후보 기간과 제외할 날, 마감 시각을 정해 링크를 공유하세요. 참여하는 사람은 로그인하지 않아도 돼요.</p>
      </header>

      <div className="flex flex-wrap items-start gap-5">
        {/* 왼쪽: 기본 정보 · 마감 · 공개 */}
        <div className="flex min-w-0 flex-[1_1_380px] flex-col gap-4">
          <section className={CARD}>
            <h2 className="text-base font-bold text-ink">기본 정보</h2>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
              제목
              <input className={fieldClass} value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="예: 12월 송년 스터디" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
              <span>설명 <span className="font-normal text-ink-2">(선택)</span></span>
              <textarea
                className="ui-input min-h-24 w-full rounded-xl bg-surface px-3.5 py-2.5 text-[15px] leading-relaxed text-ink ring-1 ring-inset ring-line focus:ring-2 focus:ring-accent focus:outline-none"
                value={description}
                maxLength={1000}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
          </section>

          <section className={CARD}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-bold text-ink">투표 마감</h2>
              <span className="text-[13px] text-ink-2">마감 뒤에는 응답을 받지 않아요</span>
            </div>
            <div role="group" aria-label="마감 시각 빠른 선택" className="flex flex-wrap gap-2">
              {DEADLINE_CHIPS.map((chip) => (
                <button
                  key={chip.kind}
                  type="button"
                  aria-pressed={kind === chip.kind}
                  onClick={() => setKind(chip.kind)}
                  className={cn(
                    "h-10 rounded-full px-3.5 text-sm ring-1 ring-inset focus-visible:outline-2 focus-visible:outline-accent",
                    kind === chip.kind ? "bg-accent-soft font-bold text-accent ring-accent" : "bg-surface text-ink ring-line-2 hover:bg-surface-2",
                  )}
                >
                  {chip.label}
                </button>
              ))}
            </div>
            {kind === "custom" && (
              <div className="flex flex-wrap gap-3">
                <label className="flex min-w-40 flex-1 flex-col gap-1.5 text-sm font-medium text-ink">
                  마감 날짜
                  <input type="date" className={fieldClass} min={today} value={customDate} onChange={(e) => setCustomDate(e.target.value)} />
                </label>
                <label className="flex min-w-32 flex-1 flex-col gap-1.5 text-sm font-medium text-ink">
                  마감 시각
                  <input type="time" className={fieldClass} value={customTime} onChange={(e) => setCustomTime(e.target.value)} />
                </label>
              </div>
            )}
            <div role="status" className={cn("flex items-start gap-3 rounded-xl px-4 py-3.5", toneClass)}>
              {deadlineNote.tone === "danger" ? <CircleAlert className="mt-0.5 size-5 shrink-0" aria-hidden /> : <Clock className="mt-0.5 size-5 shrink-0" aria-hidden />}
              <div className="flex flex-col gap-0.5">
                <strong className="text-[15px]">{deadlineNote.head}</strong>
                {deadlineNote.sub && <span className="text-sm">{deadlineNote.sub}</span>}
              </div>
            </div>
          </section>

          <fieldset className={cn(CARD, "gap-3")}>
            <legend className="sr-only">결과 공개</legend>
            <h2 className="text-base font-bold text-ink" aria-hidden>결과 공개</h2>
            {([
              ["participants", "참여한 사람 모두", "제출한 뒤에만 날짜별 가능 인원을 볼 수 있어요."],
              ["owner", "만든 사람만", "참여자는 자기 응답만 볼 수 있어요."],
            ] as const).map(([value, label, help]) => (
              <label key={value} className="flex cursor-pointer items-start gap-3">
                <input type="radio" name="visibility" className="mt-1 size-[18px] accent-[var(--accent)]" checked={visibility === value} onChange={() => setVisibility(value)} />
                <span><span className="font-medium text-ink">{label}</span><br /><span className="text-sm text-ink-2">{help}</span></span>
              </label>
            ))}
          </fieldset>
        </div>

        {/* 오른쪽: 기간 · 제외일 */}
        <section className={cn(CARD, "min-w-0 flex-[1.25_1_480px]")}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-bold text-ink">후보 기간과 제외일</h2>
            <div role="group" aria-label="달력 모드" className="flex rounded-[10px] bg-surface-2 p-[3px]">
              {([["range", "① 기간 정하기"], ["exclude", "② 제외일 찍기"]] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={mode === value}
                  onClick={() => { setMode(value); setPicking(false); }}
                  className={cn("h-9 rounded-lg px-3.5 text-sm", mode === value ? "bg-surface font-bold text-ink" : "text-ink-2")}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <p className="text-sm text-ink-2">
            {mode === "range"
              ? picking ? `끝나는 날을 눌러 주세요. (${dayLabel(start)}부터)` : "시작하는 날을 누르고, 이어서 끝나는 날을 누르세요."
              : "후보에서 뺄 날을 눌러 주세요. 다시 누르면 되돌아가요. 제외한 날은 참여자 화면에서 회색으로 잠겨요."}
          </p>

          <div className="flex items-center justify-between">
            <button type="button" aria-label="이전 달" onClick={() => setVisible(monthShift(visible, -1))} className="grid size-10 place-items-center rounded-xl text-ink-2 hover:bg-surface-2"><ChevronLeft className="size-5" /></button>
            <strong className="text-[17px] text-ink">{`${visible.slice(0, 4)}년 ${Number(visible.slice(5))}월`}</strong>
            <button type="button" aria-label="다음 달" onClick={() => setVisible(monthShift(visible, 1))} className="grid size-10 place-items-center rounded-xl text-ink-2 hover:bg-surface-2"><ChevronRight className="size-5" /></button>
          </div>

          <MonthGrids
            start={`${visible}-01`}
            end={lastDayOf(visible)}
            gap="gap-1.5"
            blankHeight="h-12"
            showLabel={false}
            cell={(day) => {
              const inRange = day >= start && day <= end;
              const isEdge = day === start || day === end;
              const out = inRange && day in excluded;
              const locked = mode === "exclude" && !inRange;
              return (
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => onDay(day)}
                  aria-pressed={out}
                  aria-label={`${dayLabel(day)}${out ? ", 제외일" : inRange ? ", 후보일" : ""}`}
                  style={out ? HATCH : undefined}
                  className={cn(
                    "h-12 rounded-xl text-[15px] ring-1 ring-inset focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-default disabled:opacity-40",
                    out ? "text-ink-2 line-through ring-line-2"
                      : isEdge ? "bg-accent font-bold text-on-accent ring-accent"
                      : inRange ? "bg-accent-soft text-ink ring-accent-soft"
                      : "bg-surface text-ink-2 ring-line hover:bg-surface-2",
                    picking && day === start && "ring-2 ring-ink",
                  )}
                >
                  {Number(day.slice(8))}
                </button>
              );
            }}
          />

          <div className="flex flex-wrap gap-4 text-[13px] text-ink-2">
            <span className="flex items-center gap-1.5"><span className="size-3.5 rounded bg-accent" />시작·끝</span>
            <span className="flex items-center gap-1.5"><span className="size-3.5 rounded bg-accent-soft ring-1 ring-line-2" />후보일</span>
            <span className="flex items-center gap-1.5"><span className="size-3.5 rounded" style={HATCH} />제외일</span>
          </div>

          <div className="flex flex-col gap-3 border-t border-line pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <strong className="text-[15px] text-ink">
                {dayLabel(start)} ~ {dayLabel(end)} · 후보 {candidates}일{excludedDays.length > 0 && ` (제외 ${excludedDays.length}일)`}
              </strong>
              <button type="button" onClick={toggleWeekends} className={buttonClass("ghost", "sm")}>{weekendsOut ? "주말 제외 풀기" : "주말 모두 제외"}</button>
            </div>
            {excludedDays.length === 0 ? (
              <span className="text-sm text-ink-2">제외한 날이 없어요. 모든 날이 후보예요.</span>
            ) : (
              <ul className="flex flex-col gap-2">
                {excludedDays.map((day) => (
                  <li key={day} className="flex items-center gap-2">
                    <span className="w-24 shrink-0 text-sm text-ink">{dayLabel(day)}</span>
                    <input
                      aria-label={`${dayLabel(day)} 제외 사유`}
                      className="h-9 min-w-0 flex-1 rounded-lg bg-surface px-3 text-sm text-ink ring-1 ring-inset ring-line placeholder:text-ink-3 focus:ring-2 focus:ring-accent focus:outline-none"
                      placeholder="사유 (선택)"
                      maxLength={40}
                      value={excluded[day] ?? ""}
                      onChange={(e) => setExcluded((prev) => ({ ...prev, [day]: e.target.value }))}
                    />
                    <button type="button" aria-label={`${dayLabel(day)} 제외 취소`} onClick={() => setExcluded((prev) => { const next = { ...prev }; delete next[day]; return next; })} className="grid size-8 place-items-center rounded-lg text-ink-2 hover:bg-surface-2">
                      <X className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center justify-end gap-3 border-t border-line bg-ground/95 px-1 py-3 backdrop-blur">
        <span role={error ? "alert" : undefined} className={cn("mr-auto text-sm", error ? "text-danger" : "text-ink-2")}>
          {error || (candidates < 1 ? "후보일이 하나도 없어요. 제외일을 줄여 주세요." : `후보 ${candidates}일 · ${localDeadline && deadlineIso ? `${deadlineLabel(deadlineIso)} 마감` : "마감 없음"}`)}
        </span>
        <button type="button" onClick={() => router.push("/polls")} className={buttonClass("ghost")}>취소</button>
        <button type="button" onClick={submit} disabled={blocked || pending} className={buttonClass("primary")}>
          {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}투표 만들기
        </button>
      </div>
    </div>
  );
}
