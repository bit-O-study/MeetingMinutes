/**
 * 개발 전용 미리보기 데이터. DB 없이 캘린더·모임 화면을 그려 보고 배치가 깨지지 않는지 측정하는 데 쓴다.
 * 운영에서는 /dev 경로가 열리지 않는다.
 */
import { buildLayers, type CalendarEntry, type LinkTarget } from "@/lib/calendar-entries";
import type { CalendarData } from "@/lib/calendar-data";
import { meetingToEntry, plannerToEntry, spaceTaskToEntry } from "@/lib/calendar-map";
import type { PlannerItem } from "@/lib/planner";

export const PREVIEW_TODAY = "2026-11-10";
export const SPACE_STUDY = "00000000-0000-4000-8000-0000000000a1";
export const SPACE_HANDOVER = "00000000-0000-4000-8000-0000000000a2";

let seq = 0;
const base = (over: Partial<PlannerItem>): PlannerItem => ({
  id: `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`,
  version: 1, done: false, kind: "task", title: "", memo: "", mode: "range",
  startDate: null, endDate: null, date: null, from: null, to: null, allDay: false, linkedItemId: null, linkedMeetingId: null, ...over,
});

const MEETING_7 = "00000000-0000-4000-8000-0000000000b1";
const MEETING_POLL = "00000000-0000-4000-8000-0000000000b2";

export function previewCalendar(month: string): CalendarData {
  seq = 0;
  const personal: PlannerItem[] = [
    base({ kind: "event", title: "치과", mode: "fixed", date: "2026-11-11", from: "15:00", to: "16:00" }),
    base({ title: "독서 기록", endDate: "2026-11-10" }),
    base({ title: "발표 자료 정리", endDate: "2026-11-12", linkedMeetingId: MEETING_7 }),
    base({ kind: "event", title: "부산 출장", mode: "range", startDate: "2026-11-18", endDate: "2026-11-20" }),
    base({ kind: "event", title: "가족 모임", mode: "range", startDate: "2026-11-22", endDate: "2026-11-23" }),
    base({ title: "세금 서류 제출", endDate: "2026-11-25" }),
    base({ kind: "event", title: "월말 회고", mode: "fixed", date: "2026-11-27", from: "10:00", to: "11:00" }),
    base({ kind: "event", title: "팀 점심", mode: "fixed", date: "2026-11-12", from: "12:00", to: "13:00" }),
    base({ kind: "event", title: "치과 상담 전화 확인", mode: "fixed", date: "2026-11-12", from: "12:30", to: "13:30" }),
    base({ title: "블로그 글 초안", mode: "none" }),
    // 같은 날에 항목이 많을 때 "+N 더 보기"로 접히는지 확인하는 날(11/16)
    ...["API 문서 검토", "리뷰 답변 쓰기", "배포 체크리스트", "회고 정리", "장애 보고서"].map((title) => base({ title, endDate: "2026-11-16" })),
    base({ title: "아주 긴 이름의 할 일이 칸 안에서 어떻게 줄바꿈되는지 확인하는 항목", endDate: "2026-11-17" }),
  ];
  const linkTitles = new Map([[MEETING_7, "7회차 스터디"]]);
  const entries: CalendarEntry[] = [];
  for (const item of personal) {
    const entry = plannerToEntry(item, PREVIEW_TODAY, linkTitles);
    if (entry) entries.push(entry);
  }
  entries.push(
    spaceTaskToEntry({ id: "t1", body: "4장 읽기", dueDate: "2026-11-12", doneAt: new Date(), spaceId: SPACE_STUDY, noteId: "n1", noteTitle: "6회차" }, PREVIEW_TODAY),
    spaceTaskToEntry({ id: "t2", body: "인수인계 문서 정리", dueDate: "2026-11-09", doneAt: null, spaceId: SPACE_HANDOVER, noteId: "n2", noteTitle: "인수인계 메모" }, PREVIEW_TODAY),
    spaceTaskToEntry({ id: "t3", body: "결제 모듈 점검", dueDate: "2026-11-26", doneAt: null, spaceId: SPACE_HANDOVER, noteId: "n2", noteTitle: "인수인계 메모" }, PREVIEW_TODAY),
  );
  const meetings = [
    { id: MEETING_7, spaceId: SPACE_STUDY, title: "7회차 스터디", status: "confirmed" as const, windowStart: "2026-11-12", windowEnd: "2026-11-14", confirmedStart: "2026-11-13", confirmedEnd: "2026-11-13", confirmedFrom: "19:00", confirmedTo: "21:00", responded: 5, members: 5 },
    { id: "00000000-0000-4000-8000-0000000000b3", spaceId: SPACE_HANDOVER, title: "인수인계 점검", status: "confirmed" as const, windowStart: "2026-11-17", windowEnd: "2026-11-17", confirmedStart: "2026-11-17", confirmedEnd: "2026-11-17", confirmedFrom: "14:00", confirmedTo: "15:30", responded: 3, members: 3 },
    { id: "00000000-0000-4000-8000-0000000000b4", spaceId: SPACE_STUDY, title: "리팩터링 워크숍(1박2일)", status: "confirmed" as const, windowStart: "2026-11-27", windowEnd: "2026-11-28", confirmedStart: "2026-11-27", confirmedEnd: "2026-11-28", confirmedFrom: null, confirmedTo: null, responded: 5, members: 5 },
    { id: MEETING_POLL, spaceId: SPACE_STUDY, title: "송년회 날짜 투표", status: "polling" as const, windowStart: "2026-11-21", windowEnd: "2026-11-29", confirmedStart: null, confirmedEnd: null, confirmedFrom: null, confirmedTo: null, responded: 5, members: 6 },
  ];
  for (const meeting of meetings) {
    const entry = meetingToEntry(meeting);
    if (entry) entries.push(entry);
  }
  return {
    layers: buildLayers([{ id: SPACE_STUDY, name: "프론트엔드 스터디" }, { id: SPACE_HANDOVER, name: "결제 모듈 인수인계" }]),
    entries,
    planner: personal,
    today: PREVIEW_TODAY,
    month,
  };
}

export const PREVIEW_LINK_TARGETS: LinkTarget[] = [
  { kind: "event", id: "00000000-0000-4000-8000-000000000004", title: "부산 출장", when: "11/18~11/20" },
  { kind: "meeting", id: MEETING_7, title: "7회차 스터디", when: "11/13" },
];

/* ── 모임 투표 미리보기 ─────────────────────────────────────────── */
import type { MeetingDetail, MeetingSummary } from "@/lib/meeting-data";
import type { Votes } from "@/lib/meetings";

const MEMBERS = [
  { id: "u1", name: "BO" },
  { id: "u2", name: "지수" },
  { id: "u3", name: "민준" },
  { id: "u4", name: "서연" },
  { id: "u5", name: "도현" },
  { id: "u6", name: "하늘" },
];

/** 후보 11/21(토)~11/29(일), 연속 2일. 도현은 아직 응답하지 않았다. */
export function previewMeeting(status: "polling" | "confirmed" = "polling", manager = true): MeetingDetail {
  const answers: Record<string, Record<string, "yes" | "maybe" | "no">> = {
    "2026-11-21": { u1: "yes", u2: "yes", u3: "no", u4: "yes", u6: "maybe" },
    "2026-11-22": { u1: "maybe", u2: "yes", u3: "no", u4: "no", u6: "yes" },
    "2026-11-23": { u1: "no", u2: "yes", u3: "yes", u4: "no", u6: "no" },
    "2026-11-24": { u1: "yes", u2: "no", u3: "yes", u4: "yes", u6: "maybe" },
    "2026-11-25": { u1: "yes", u2: "yes", u3: "yes", u4: "maybe", u6: "yes" },
    "2026-11-26": { u1: "yes", u2: "no", u3: "yes", u4: "yes", u6: "yes" },
    "2026-11-27": { u1: "yes", u2: "yes", u3: "yes", u4: "yes", u6: "yes" },
    "2026-11-28": { u1: "yes", u2: "yes", u3: "yes", u4: "yes", u6: "maybe" },
    "2026-11-29": { u1: "maybe", u2: "yes", u3: "no", u4: "yes", u6: "yes" },
  };
  const votes: Votes = answers;
  const confirmed = status === "confirmed";
  return {
    meeting: {
      id: MEETING_POLL, title: "송년회 날짜 정하기", location: "강남 스터디룸 B", memo: "저녁 식사 포함이에요. 불가능한 날은 꼭 칠해 주세요.",
      status, spanDays: 2, windowStart: "2026-11-21", windowEnd: "2026-11-29",
      confirmedStart: confirmed ? "2026-11-27" : null, confirmedEnd: confirmed ? "2026-11-28" : null,
      confirmedFrom: confirmed ? "18:00" : null, confirmedTo: confirmed ? "21:00" : null,
      respondBy: "2026-11-14T13:00:00.000Z", responded: 5, members: 6, needsMyAnswer: false, createdBy: "u1", noteId: confirmed ? "n-note" : null, version: 1,
    },
    members: MEMBERS,
    votes,
    myUserId: "u1",
    canManage: manager,
    busy: { "2026-11-22": ["가족 모임"], "2026-11-23": ["가족 모임"] },
  };
}

export const PREVIEW_MEETING_LIST: MeetingSummary[] = [
  { id: "m-1", title: "송년회 날짜 정하기", location: "강남 스터디룸 B", status: "polling", spanDays: 2, windowStart: "2026-11-21", windowEnd: "2026-11-29", confirmedStart: null, confirmedEnd: null, confirmedFrom: null, confirmedTo: null, respondBy: null, responded: 5, members: 6, needsMyAnswer: true },
  { id: "m-2", title: "8회차 스터디 시간", location: "", status: "polling", spanDays: 1, windowStart: "2026-11-16", windowEnd: "2026-11-20", confirmedStart: null, confirmedEnd: null, confirmedFrom: null, confirmedTo: null, respondBy: null, responded: 6, members: 6, needsMyAnswer: false },
  { id: "m-3", title: "7회차 스터디", location: "강남 스터디룸 B", status: "confirmed", spanDays: 1, windowStart: "2026-11-12", windowEnd: "2026-11-14", confirmedStart: "2026-11-13", confirmedEnd: "2026-11-13", confirmedFrom: "19:00", confirmedTo: "21:00", respondBy: null, responded: 5, members: 6, needsMyAnswer: false },
  { id: "m-4", title: "리팩터링 워크숍(1박2일) 아주 긴 이름의 모임이 목록 카드에서 어떻게 줄바꿈되는지", location: "경기도 가평 어딘가의 아주 긴 이름의 펜션과 주소", status: "confirmed", spanDays: 2, windowStart: "2026-11-27", windowEnd: "2026-11-28", confirmedStart: "2026-11-27", confirmedEnd: "2026-11-28", confirmedFrom: null, confirmedTo: null, respondBy: null, responded: 6, members: 6, needsMyAnswer: false },
];
