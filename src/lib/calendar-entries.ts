/**
 * 캘린더에 올라가는 한 줄.
 *
 * 개인 일정·할 일, 스페이스 노트의 할 일, 확정된 모임, 투표 중인 모임을 한 모양으로 합친다.
 * 원본을 복사해 두지 않는다 — 조회할 때 이 모양으로 바꿔 보여 줄 뿐이라 원본이 바뀌면 캘린더도 바뀐다.
 */
export type EntryKind = "event" | "task" | "meeting" | "poll";

/** 레이어: 내 개인 항목 하나 + 내가 속한 스페이스마다 하나. tone 은 색 팔레트 번호(0~7). */
export type CalendarLayer = { id: string; label: string; tone: number };

export const PERSONAL_LAYER = "me";

export type EntrySource =
  | { type: "planner"; id: string; version: number }
  | { type: "task"; id: string; spaceId: string; noteId: string }
  | { type: "meeting"; id: string; spaceId: string };

export type CalendarEntry = {
  /** 레이어 안에서 유일한 키. 같은 모임이 확정/투표 양쪽에 나오지 않는다. */
  id: string;
  kind: EntryKind;
  layerId: string;
  title: string;
  /** 포함 양끝. 하루짜리는 start === end. */
  start: string;
  end: string;
  /** "HH:MM". 종일·기간 일정은 null. */
  from: string | null;
  to: string | null;
  done: boolean;
  overdue: boolean;
  /** 눌렀을 때 이동할 곳. 개인 항목은 편집 창을 열어서 href 가 없다. */
  href: string | null;
  /** 할 일이 딸린 일정·모임의 제목. 칩으로 보여 준다. */
  linkTitle: string | null;
  /** 투표 중인 모임의 응답 현황 같은 보조 문구 */
  note: string | null;
  source: EntrySource;
};

const KIND_ORDER: Record<EntryKind, number> = { event: 0, meeting: 1, poll: 2, task: 3 };

/** 한 줄 안에서의 표시 순서: 기간이 긴 것 → 종류 → 시각 → 제목. */
export function compareEntries(a: CalendarEntry, b: CalendarEntry): number {
  if (a.start !== b.start) return a.start < b.start ? -1 : 1;
  const spanA = a.end > a.start ? 1 : 0;
  const spanB = b.end > b.start ? 1 : 0;
  if (spanA !== spanB) return spanB - spanA;
  if (KIND_ORDER[a.kind] !== KIND_ORDER[b.kind]) return KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
  if ((a.from ?? "") !== (b.from ?? "")) return (a.from ?? "") < (b.from ?? "") ? -1 : 1;
  return a.title.localeCompare(b.title, "ko");
}

export function occursOnDay(entry: Pick<CalendarEntry, "start" | "end">, day: string): boolean {
  return day >= entry.start && day <= entry.end;
}

/** 레이어 id → 팔레트 번호. 개인은 0, 스페이스는 1~7을 돌려 쓴다. */
export function buildLayers(spaces: { id: string; name: string }[]): CalendarLayer[] {
  return [
    { id: PERSONAL_LAYER, label: "내 일정", tone: 0 },
    ...spaces.map((space, index) => ({ id: space.id, label: space.name, tone: (index % 7) + 1 })),
  ];
}
