/**
 * 원본 레코드 → 캘린더 한 줄. DB 조회와 분리해 두어 변환 규칙을 테스트로 고정한다.
 *
 * 날짜가 없는 항목(미정 할 일)은 캘린더에 올리지 않고 null 을 돌려준다. 할 일 목록에서만 보인다.
 */
import type { CalendarEntry } from "./calendar-entries";
import { PERSONAL_LAYER } from "./calendar-entries";
import { plannerOverdue, type PlannerItem } from "./planner";

export function plannerToEntry(item: PlannerItem, today: string, linkTitles: ReadonlyMap<string, string>): CalendarEntry | null {
  if (item.mode === "none") return null;
  let start: string;
  let end: string;
  let from: string | null = null;
  let to: string | null = null;
  if (item.mode === "fixed") {
    if (!item.date) return null;
    start = item.date;
    end = item.date;
    if (!item.allDay) {
      from = item.from;
      to = item.to;
    }
  } else {
    if (!item.endDate) return null;
    // 시작일이 없는 기간 할 일은 마감일 하루에만 올린다.
    start = item.startDate ?? item.endDate;
    end = item.endDate;
  }
  const linkId = item.linkedItemId ?? item.linkedMeetingId ?? null;
  return {
    id: `p:${item.id}`,
    kind: item.kind === "event" ? "event" : "task",
    layerId: PERSONAL_LAYER,
    title: item.title,
    start,
    end,
    from,
    to,
    done: item.done,
    overdue: plannerOverdue(item, today),
    href: null,
    linkTitle: linkId ? (linkTitles.get(linkId) ?? null) : null,
    note: null,
    source: { type: "planner", id: item.id, version: item.version },
  };
}

export type SpaceTaskRow = { id: string; body: string; dueDate: string; doneAt: Date | null; spaceId: string; noteId: string; noteTitle: string };

export function spaceTaskToEntry(row: SpaceTaskRow, today: string): CalendarEntry {
  return {
    id: `t:${row.id}`,
    kind: "task",
    layerId: row.spaceId,
    title: row.body,
    start: row.dueDate,
    end: row.dueDate,
    from: null,
    to: null,
    done: row.doneAt !== null,
    overdue: row.doneAt === null && row.dueDate < today,
    href: `/s/${row.spaceId}/n/${row.noteId}`,
    linkTitle: null,
    note: row.noteTitle,
    source: { type: "task", id: row.id, spaceId: row.spaceId, noteId: row.noteId },
  };
}

export type MeetingRow = {
  id: string;
  spaceId: string;
  title: string;
  status: "polling" | "confirmed" | "cancelled";
  windowStart: string;
  windowEnd: string;
  confirmedStart: string | null;
  confirmedEnd: string | null;
  confirmedFrom: string | null;
  confirmedTo: string | null;
  /** 한 날이라도 응답한 멤버 수 / 현재 멤버 수 */
  responded: number;
  members: number;
};

export function meetingToEntry(row: MeetingRow): CalendarEntry | null {
  if (row.status === "cancelled") return null;
  const confirmed = row.status === "confirmed" && row.confirmedStart && row.confirmedEnd;
  return {
    id: `m:${row.id}`,
    kind: confirmed ? "meeting" : "poll",
    layerId: row.spaceId,
    title: row.title,
    start: confirmed ? row.confirmedStart! : row.windowStart,
    end: confirmed ? row.confirmedEnd! : row.windowEnd,
    from: confirmed ? row.confirmedFrom : null,
    to: confirmed ? row.confirmedTo : null,
    done: false,
    overdue: false,
    href: `/s/${row.spaceId}/m/${row.id}`,
    linkTitle: null,
    note: confirmed ? null : `투표 중 · 응답 ${row.responded}/${row.members}명`,
    source: { type: "meeting", id: row.id, spaceId: row.spaceId },
  };
}
