import type { CSSProperties, ReactNode } from "react";

import { buildMonths } from "@/lib/polls";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** 후보가 아닌 날(제외일) 표시. 색만으로 구분하지 않도록 사선 무늬를 함께 쓴다. */
export const HATCH: CSSProperties = {
  background: "repeating-linear-gradient(135deg, var(--surface-2) 0 5px, var(--line-2) 5px 6px)",
};

/**
 * 기간이 걸친 달마다 7열 달력을 그린다. 칸 하나하나는 호출한 쪽이 정한다(투표·결과·확정이 모양이 다르다).
 * `inRange`가 false 인 칸은 기간 밖이라 빈 칸으로 둔다 — 눌러도 아무 일이 없는 칸을 보여 주지 않는다.
 */
export function MonthGrids({
  start,
  end,
  gap = "gap-1",
  blankHeight = "h-12",
  showLabel = true,
  cell,
}: {
  start: string;
  end: string;
  gap?: string;
  blankHeight?: string;
  /** 달 제목을 칸 위에 붙일지. 호출한 쪽이 달 이동 머리글을 따로 그리면 끈다. */
  showLabel?: boolean;
  cell: (day: string) => ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5">
      {buildMonths(start, end).map((month) => (
        <section key={month.month} aria-label={month.label}>
          {showLabel && <h3 className="mb-2 text-base font-bold text-ink">{month.label}</h3>}
          <div className={`grid grid-cols-7 ${gap}`}>
            {WEEKDAYS.map((w) => (
              <div key={w} className="py-0.5 text-center text-xs text-ink-2">{w}</div>
            ))}
            {month.cells.map((c, index) =>
              c && c.inRange ? <div key={c.day} className="contents">{cell(c.day)}</div> : <div key={c?.day ?? `b${index}`} className={blankHeight} aria-hidden="true" />,
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
