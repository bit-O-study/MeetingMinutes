import { cn } from "@/lib/utils";

const TONES = {
  neutral: "bg-surface-2 text-ink-3",
  accent: "bg-accent-soft text-accent",
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  info: "bg-info-soft text-info",
} as const;

export type BadgeTone = keyof typeof TONES;

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex flex-none items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px] leading-relaxed whitespace-nowrap",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** 작성 중 / 정리됨. 확정 개념은 없다. */
export function NoteStatusBadge({ status }: { status: "draft" | "tidied" }) {
  return status === "tidied" ? (
    <Badge tone="ok">정리됨</Badge>
  ) : (
    <Badge tone="warn">작성 중</Badge>
  );
}

/**
 * 기한 표시. 지연은 상태값이 아니라 기한과 완료 여부로 계산한 결과다.
 * 필터 칩으로 만들지 말 것 — 네 번째 상태값으로 오인된다.
 */
export function DueBadge({
  dueDate,
  overdue,
  today,
}: {
  dueDate: string | null;
  overdue: boolean;
  today: string;
}) {
  if (!dueDate) return null;
  if (overdue) return <Badge tone="accent">지연 · {fmt(dueDate)}</Badge>;
  if (dueDate === today) return <Badge tone="warn">오늘</Badge>;
  return <Badge tone="neutral">{fmt(dueDate)}</Badge>;
}

function fmt(isoDate: string) {
  const [, m, d] = isoDate.split("-");
  return `${Number(m)}/${Number(d)}`;
}
