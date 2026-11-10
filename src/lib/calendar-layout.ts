/**
 * 월 격자 배치. 기간 일정은 주마다 하나로 이어진 막대로 그리고, 하루짜리는 칸 안에 쌓는다.
 *
 * 화면이 이 계산 결과만 따르므로 "겹침이 없다"는 사실을 DOM 없이 테스트할 수 있다.
 * 한 줄(lane)에는 같은 칸을 두 항목이 차지하지 않는다.
 */
import { addDays, monthOf, startOfWeek, toTime } from "./calendar-dates";
import { compareEntries, type CalendarEntry } from "./calendar-entries";

const DAY_MS = 86_400_000;

export type Segment = {
  entry: CalendarEntry;
  /** 0(일) ~ 6(토) */
  col0: number;
  col1: number;
  /** 앞/뒤 주에서 이어짐 — 막대 모서리를 각지게 그린다 */
  contLeft: boolean;
  contRight: boolean;
  lane: number;
};

export type WeekLayout = {
  weekStart: string;
  days: string[];
  segments: Segment[];
  /** 칸마다 줄 수 한도를 넘어 가려진 항목 수 */
  hidden: number[];
  /** 실제로 쓴 줄 수(가려진 항목 표시 줄 제외) */
  lanes: number;
};

export function weekDays(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
}

/** 그 달이 걸친 주의 시작일(일요일)들. 4~6주. */
export function monthWeeks(month: string): string[] {
  const first = `${month}-01`;
  const last = addDays(`${addMonthsFirst(month)}`, -1);
  const weeks: string[] = [];
  for (let cursor = startOfWeek(first); cursor <= last; cursor = addDays(cursor, 7)) weeks.push(cursor);
  return weeks;
}

function addMonthsFirst(month: string): string {
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString().slice(0, 10);
}

export function isInMonth(day: string, month: string): boolean {
  return monthOf(day) === month;
}

/**
 * 한 주의 배치.
 * @param maxLanes 한 칸에 보여 줄 최대 줄 수. 넘치는 항목은 hidden 으로 센다.
 */
export function layoutWeek(entries: CalendarEntry[], weekStart: string, maxLanes: number): WeekLayout {
  const days = weekDays(weekStart);
  const weekEnd = days[6];
  const segments: Segment[] = [];

  for (const entry of [...entries].sort(compareEntries)) {
    if (entry.end < weekStart || entry.start > weekEnd) continue;
    const from = entry.start < weekStart ? weekStart : entry.start;
    const to = entry.end > weekEnd ? weekEnd : entry.end;
    segments.push({
      entry,
      col0: Math.round((toTime(from) - toTime(weekStart)) / DAY_MS),
      col1: Math.round((toTime(to) - toTime(weekStart)) / DAY_MS),
      contLeft: entry.start < weekStart,
      contRight: entry.end > weekEnd,
      lane: 0,
    });
  }

  // 시작 칸이 빠른 순, 긴 막대 우선으로 가장 위의 빈 줄에 놓는다.
  segments.sort((a, b) => a.col0 - b.col0 || (b.col1 - b.col0) - (a.col1 - a.col0) || compareEntries(a.entry, b.entry));
  const laneEnd: number[] = [];
  for (const segment of segments) {
    let lane = 0;
    while (laneEnd[lane] !== undefined && laneEnd[lane] >= segment.col0) lane += 1;
    laneEnd[lane] = segment.col1;
    segment.lane = lane;
  }

  const hidden = Array<number>(7).fill(0);
  for (const segment of segments) {
    if (segment.lane < maxLanes) continue;
    for (let col = segment.col0; col <= segment.col1; col += 1) hidden[col] += 1;
  }

  return {
    weekStart,
    days,
    segments: segments.filter((segment) => segment.lane < maxLanes),
    hidden,
    lanes: Math.min(maxLanes, laneEnd.length),
  };
}

/** 모바일 월 칸의 점. 종류별 모양을 위해 항목 자체를 돌려준다(최대 max개). */
export function dayDots(entries: CalendarEntry[], day: string, max = 3): { dots: CalendarEntry[]; extra: number } {
  const onDay = entries.filter((entry) => day >= entry.start && day <= entry.end).sort(compareEntries);
  return { dots: onDay.slice(0, max), extra: Math.max(0, onDay.length - max) };
}

export type DayBlock = {
  entry: CalendarEntry;
  /** 시각표 시작 시각(분)을 기준으로 한 위·높이(분) */
  startMin: number;
  endMin: number;
  /** 시간이 겹치는 묶음 안에서의 칸 번호와 전체 칸 수. 겹치는 일정은 나란히 놓는다. */
  col: number;
  cols: number;
};

export function toMinutes(time: string): number {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

/**
 * 하루 안의 시각 지정 일정 배치. 시간이 겹치는 일정은 같은 높이를 나눠 쓰는 열로 놓아
 * 서로를 가리지 않게 한다. 최소 높이(minMinutes)보다 짧은 일정도 글자가 보이도록 늘려 계산한다.
 */
export function layoutDayBlocks(entries: CalendarEntry[], minMinutes = 45): DayBlock[] {
  const timed = entries
    .filter((entry) => entry.from && entry.to)
    .map((entry) => {
      const startMin = toMinutes(entry.from!);
      return { entry, startMin, endMin: Math.max(toMinutes(entry.to!), startMin + minMinutes) };
    })
    .sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);

  const blocks: DayBlock[] = [];
  let cluster: DayBlock[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const cols = cluster.reduce((max, block) => Math.max(max, block.col + 1), 0);
    for (const block of cluster) block.cols = cols;
    blocks.push(...cluster);
    cluster = [];
    clusterEnd = -1;
  };
  for (const item of timed) {
    if (cluster.length > 0 && item.startMin >= clusterEnd) flush();
    const taken = new Set(cluster.filter((block) => block.endMin > item.startMin).map((block) => block.col));
    let col = 0;
    while (taken.has(col)) col += 1;
    cluster.push({ ...item, col, cols: 1 });
    clusterEnd = Math.max(clusterEnd, item.endMin);
  }
  if (cluster.length > 0) flush();
  return blocks;
}
