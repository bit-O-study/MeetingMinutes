import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";

/**
 * Yjs 문서 상태를 담는 bytea 컬럼.
 * Drizzle에 bytea 기본 타입이 없어 직접 정의한다.
 */
const bytea = customType<{ data: Uint8Array; notNull: false; default: false }>({
  dataType() {
    return "bytea";
  },
  toDriver(value) {
    return Buffer.from(value);
  },
  fromDriver(value) {
    return new Uint8Array(value as Buffer);
  },
});

/* ────────────────────────────────────────────────────────────
   자체 로그인 · Auth.js 데이터베이스 세션
   ──────────────────────────────────────────────────────────── */

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name"),
  email: text("email").notNull(),
  emailVerified: timestamp("email_verified", { withTimezone: true }),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// 비밀번호를 사용자 조회에 섞지 않고 정규화한 이메일의 중복 가입을 DB에서 막는다.
export const passwordCredentials = pgTable("password_credentials", {
  email: text("email").primaryKey(),
  userId: uuid("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  passwordHash: text("password_hash").notNull(),
});

// 인스턴스가 달라도 같은 횟수를 보도록 로그인 시도 제한을 DB에 저장한다.
export const authAttempts = pgTable("auth_attempts", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, (t) => [index("auth_attempts_expires_idx").on(t.expiresAt)]);

export const accounts = pgTable(
  "accounts",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { withTimezone: true }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

/* ────────────────────────────────────────────────────────────
   스페이스 — 권한 경계. 속하면 안의 모든 노트를 읽고 쓴다.
   ──────────────────────────────────────────────────────────── */

/** 스페이스 용도. 새 노트의 기본 템플릿을 결정한다. */
export type SpaceKind = "study" | "handover" | "general";

export const spaces = pgTable("spaces", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  kind: text("kind").$type<SpaceKind>().notNull().default("general"),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  /** 노트 목록 정렬과 사이드바 정렬에 쓰는 마지막 활동 시각 */
  lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

/** 멤버끼리 권한 차등을 두지 않는다. 소유자만 초대·삭제 권한을 더 가진다. */
export type MemberRole = "owner" | "member";

export const spaceMembers = pgTable(
  "space_members",
  {
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").$type<MemberRole>().notNull().default("member"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.spaceId, t.userId] }),
    index("space_members_user_idx").on(t.userId),
  ],
);

/** 채팅 원문은 이슈 가공 후에도 그대로 남는다. */
export const projectMessages = pgTable("project_messages", {
  id: uuid("id").primaryKey(),
  spaceId: uuid("space_id").notNull().references(() => spaces.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("project_messages_space_created_idx").on(t.spaceId, t.createdAt)]).enableRLS();

/** 노트와 별개로 프로젝트에서 추적하는 이슈. 권한 경계는 스페이스다. */
export const issues = pgTable("issues", {
  sourceMessageId: uuid("source_message_id").references(() => projectMessages.id, { onDelete: "set null" }),
  originalBody: text("original_body"),
  id: uuid("id").defaultRandom().primaryKey(),
  spaceId: uuid("space_id").notNull().references(() => spaces.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  status: text("status").$type<"raw" | "open" | "in_progress" | "closed">().notNull().default("open"),
  priority: text("priority").$type<"low" | "normal" | "high">().notNull().default("normal"),
  assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  version: integer("version").notNull().default(1),
}, (t) => [uniqueIndex("issues_source_message_idx").on(t.sourceMessageId), index("issues_space_status_updated_idx").on(t.spaceId, t.status, t.updatedAt)]).enableRLS();

/** 이메일이 아니라 링크로 초대한다. 스터디에서 주소를 미리 받는 건 마찰이 크다. */
export const inviteLinks = pgTable(
  "invite_links",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("invite_links_token_idx").on(t.token)],
);

/* ────────────────────────────────────────────────────────────
   노트 — 회의록이든 메모든 같은 그릇
   ──────────────────────────────────────────────────────────── */

export type TemplateKind = "study" | "handover" | "blank";
/** 작성 중 / 정리됨. 확정 개념은 두지 않는다. */
export type NoteStatus = "draft" | "tidied";

export const notes = pgTable(
  "notes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    template: text("template").$type<TemplateKind>().notNull().default("blank"),
    status: text("status").$type<NoteStatus>().notNull().default("draft"),
    /** Tiptap 문서 JSON. Yjs 상태에서 파생되며 렌더·검색용 사본이다. */
    content: jsonb("content"),
    /** 검색용 평문. content 저장 시 함께 갱신한다. */
    plainText: text("plain_text").notNull().default(""),
    /** 스터디 회차 번호. 제목 자동 생성에 쓴다. */
    sessionNo: integer("session_no"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("notes_space_idx").on(t.spaceId, t.updatedAt),
    index("notes_updated_idx").on(t.updatedAt),
  ],
);

/**
 * 공동 편집 문서 상태.
 * notes와 1:1이지만 갱신 빈도와 크기가 전혀 달라 테이블을 분리한다.
 */
export const noteDocs = pgTable("note_docs", {
  noteId: uuid("note_id")
    .primaryKey()
    .references(() => notes.id, { onDelete: "cascade" }),
  /** Y.encodeStateAsUpdate 결과 */
  state: bytea("state"),
  snapshotAt: timestamp("snapshot_at", { withTimezone: true }).defaultNow().notNull(),
});

/* ────────────────────────────────────────────────────────────
   할 일 — 본문 체크박스와 같은 데이터. 두 벌로 관리하지 않는다.
   ──────────────────────────────────────────────────────────── */

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    noteId: uuid("note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    /** 스페이스 단위 조회를 위해 비정규화 */
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    /** null이면 스페이스 공용 할 일 (스터디의 "전원 4장 읽기") */
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    /** 조직 시간대(Asia/Seoul) 기준 날짜 */
    dueDate: date("due_date"),
    doneAt: timestamp("done_at", { withTimezone: true }),
    /** 본문 안 해당 체크박스 노드 id. 양방향 동기화의 연결 고리. */
    blockId: text("block_id"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("tasks_assignee_idx").on(t.assigneeId, t.doneAt, t.dueDate),
    index("tasks_space_idx").on(t.spaceId, t.doneAt),
    index("tasks_note_idx").on(t.noteId),
    uniqueIndex("tasks_block_idx").on(t.noteId, t.blockId),
  ],
);

/* ────────────────────────────────────────────────────────────
   변경 이력 — 확정·버전 스냅샷을 대신한다
   ──────────────────────────────────────────────────────────── */

export const noteRevisions = pgTable(
  "note_revisions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    noteId: uuid("note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    /**
     * 그 시점의 Tiptap JSON.
     *
     * Yjs 바이너리 대신 JSON으로 둔다. 미리보기는 그대로 렌더하면 되고,
     * 되돌리기는 setContent 한 번이면 Yjs가 알아서 차이를 계산해 모두에게 전파한다.
     * 바이너리로 두면 미리보기마다 Y.Doc을 만들어 변환해야 한다.
     */
    content: jsonb("content"),
    /** "막힌 것 · 질문 수정" 처럼 목록에 보여 줄 한 줄 */
    summary: text("summary"),
    /** 되돌리기로 생긴 리비전인지. 되돌린 행위도 이력에 남아 다시 복구할 수 있다. */
    isRevert: boolean("is_revert").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("note_revisions_note_idx").on(t.noteId, t.createdAt)],
);

/* ────────────────────────────────────────────────────────────
   공유 링크 — 노트 1건, 읽기 전용
   ──────────────────────────────────────────────────────────── */

export const shareLinks = pgTable(
  "share_links",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    noteId: uuid("note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    viewCount: integer("view_count").notNull().default(0),
  },
  (t) => [
    uniqueIndex("share_links_token_idx").on(t.token),
    index("share_links_note_idx").on(t.noteId),
  ],
);

/* ──────────────────────────────────────────────────────────── */

export type User = typeof users.$inferSelect;
export type Space = typeof spaces.$inferSelect;
export type SpaceMember = typeof spaceMembers.$inferSelect;
export type InviteLink = typeof inviteLinks.$inferSelect;
export type Note = typeof notes.$inferSelect;
/* ────────────────────────────────────────────────────────────
   하루 접속 — 통합 어드민의 "하루 몇 명 들어왔나" (2026-10-14)
   ──────────────────────────────────────────────────────────── */

/**
 * 사람·날짜(서울)마다 한 줄. 로그인한 사람이 앱 화면을 열 때 기록한다.
 * 화면을 몇 번 열었는지는 세지 않는다 — 궁금한 건 "몇 명"이고, 매 요청 쓰기를 늘리지 않으려고.
 * last_seen_at 만 갱신해 그날 마지막으로 본 시각은 남긴다.
 */
export const dailyVisits = pgTable(
  "daily_visits",
  {
    day: date("day").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.day, t.userId] })],
).enableRLS();

export type NewNote = typeof notes.$inferInsert;
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type NoteRevision = typeof noteRevisions.$inferSelect;
export type ShareLink = typeof shareLinks.$inferSelect;

/** 개인 일정은 프로젝트 멤버십과 독립적이며 모든 조회/변경에서 ownerId를 검사한다. */
export const personalPlannerItems = pgTable("personal_planner_items", {
  id: uuid("id").primaryKey(),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").$type<"event" | "task">().notNull(),
  title: text("title").notNull(), memo: text("memo").notNull().default(""),
  mode: text("mode").$type<"range" | "fixed" | "none">().notNull(),
  startDate: date("start_date"), endDate: date("end_date"), scheduledDate: date("scheduled_date"),
  startsAt: timestamp("starts_at", { withTimezone: true }), endsAt: timestamp("ends_at", { withTimezone: true }),
  allDay: boolean("all_day").notNull().default(false),
  doneAt: timestamp("done_at", { withTimezone: true }),
  /** 이 항목이 딸린 개인 일정(할 일 → 일정). 일정이 지워지면 연결만 끊긴다. */
  linkedItemId: uuid("linked_item_id").references((): AnyPgColumn => personalPlannerItems.id, { onDelete: "set null" }),
  /** 이 항목이 딸린 스페이스 모임(할 일 → 모임). */
  linkedMeetingId: uuid("linked_meeting_id").references((): AnyPgColumn => meetings.id, { onDelete: "set null" }),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  index("personal_planner_owner_idx").on(t.ownerId, t.kind, t.doneAt),
  index("personal_planner_calendar_idx").on(t.ownerId, t.scheduledDate),
  index("personal_planner_range_idx").on(t.ownerId, t.endDate),
  check("personal_planner_kind_check", sql`${t.kind} IN ('event','task') AND (${t.kind} = 'task' OR (${t.mode} IN ('fixed','range') AND ${t.doneAt} IS NULL AND (${t.mode} = 'fixed' OR ${t.startDate} IS NOT NULL)))`),
  check("personal_planner_link_check", sql`${t.kind} = 'task' OR (${t.linkedItemId} IS NULL AND ${t.linkedMeetingId} IS NULL)`),
  index("personal_planner_linked_meeting_idx").on(t.linkedMeetingId),
  index("personal_planner_linked_item_idx").on(t.linkedItemId),
  check("personal_planner_title_check", sql`length(trim(${t.title})) BETWEEN 1 AND 160 AND length(${t.memo}) <= 4000 AND ${t.version} > 0`),
  check("personal_planner_schedule_check", sql`(
    (${t.mode} = 'none' AND ${t.startDate} IS NULL AND ${t.endDate} IS NULL AND ${t.scheduledDate} IS NULL AND ${t.startsAt} IS NULL AND ${t.endsAt} IS NULL AND NOT ${t.allDay}) OR
    (${t.mode} = 'range' AND ${t.endDate} IS NOT NULL AND (${t.startDate} IS NULL OR ${t.startDate} <= ${t.endDate}) AND ${t.scheduledDate} IS NULL AND ${t.startsAt} IS NULL AND ${t.endsAt} IS NULL AND NOT ${t.allDay}) OR
    (${t.mode} = 'fixed' AND ${t.scheduledDate} IS NOT NULL AND ${t.startDate} IS NULL AND ${t.endDate} IS NULL AND
      ((${t.allDay} AND ${t.startsAt} IS NULL AND ${t.endsAt} IS NULL) OR
       (NOT ${t.allDay} AND ${t.startsAt} IS NOT NULL AND ${t.endsAt} IS NOT NULL AND ${t.endsAt} > ${t.startsAt} AND (${t.startsAt} AT TIME ZONE 'Asia/Seoul')::date = ${t.scheduledDate} AND (${t.endsAt} AT TIME ZONE 'Asia/Seoul')::date = ${t.scheduledDate}))))`),
]).enableRLS();

export const projectFiles = pgTable("project_files", {
  id: uuid("id").primaryKey(),
  spaceId: uuid("space_id").notNull().references(() => spaces.id, { onDelete: "cascade" }),
  noteId: uuid("note_id").references(() => notes.id, { onDelete: "set null" }),
  kind: text("kind").$type<"image" | "package">().notNull(),
  name: text("name").notNull(),
  mime: text("mime").notNull(),
  size: integer("size").notNull(),
  sha256: text("sha256").notNull(),
  versionLabel: text("version_label").notNull().default(""),
  description: text("description").notNull().default(""),
  uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("project_files_space_created_idx").on(t.spaceId, t.createdAt), index("project_files_note_idx").on(t.noteId)]).enableRLS();

/* ────────────────────────────────────────────────────────────
   모임 일정 정하기 — 후보 기간 안의 날짜마다 멤버가 가능·조건부·불가를 칠한다
   ──────────────────────────────────────────────────────────── */

export type MeetingStatus = "polling" | "confirmed" | "cancelled";
export type MeetingAnswer = "yes" | "maybe" | "no";

/**
 * 후보는 시각 슬롯이 아니라 **날짜**다. `window_start..window_end` 안의 모든 날이 후보이고,
 * `span_days`가 1보다 크면 그만큼 이어지는 날짜 구간(1박2일, 2박3일)을 찾는다.
 * 시각은 날짜가 정해진 뒤 `confirmed_from/to`로 한 번 더 정한다.
 */
export const meetings = pgTable("meetings", {
  id: uuid("id").defaultRandom().primaryKey(),
  spaceId: uuid("space_id").notNull().references(() => spaces.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  location: text("location").notNull().default(""),
  memo: text("memo").notNull().default(""),
  status: text("status").$type<MeetingStatus>().notNull().default("polling"),
  spanDays: integer("span_days").notNull().default(1),
  windowStart: date("window_start").notNull(),
  windowEnd: date("window_end").notNull(),
  /** 응답 마감. 지나도 확정 전에는 응답할 수 있다(소프트 마감). */
  respondBy: timestamp("respond_by", { withTimezone: true }),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  confirmedStart: date("confirmed_start"),
  confirmedEnd: date("confirmed_end"),
  /** "HH:MM". 둘 다 있거나 둘 다 없다. */
  confirmedFrom: text("confirmed_from"),
  confirmedTo: text("confirmed_to"),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  noteId: uuid("note_id").references(() => notes.id, { onDelete: "set null" }),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("meetings_space_status_idx").on(t.spaceId, t.status, t.windowStart),
  index("meetings_confirmed_idx").on(t.spaceId, t.confirmedStart),
  check("meetings_title_check", sql`length(trim(${t.title})) BETWEEN 1 AND 120 AND length(${t.location}) <= 200 AND length(${t.memo}) <= 4000`),
  check("meetings_status_check", sql`${t.status} IN ('polling','confirmed','cancelled')`),
  check("meetings_span_check", sql`${t.spanDays} BETWEEN 1 AND 7`),
  check("meetings_window_check", sql`${t.windowEnd} >= ${t.windowStart} AND ${t.windowEnd} - ${t.windowStart} <= 60 AND ${t.windowEnd} - ${t.windowStart} + 1 >= ${t.spanDays}`),
  check("meetings_confirmed_check", sql`(${t.status} = 'confirmed') = (${t.confirmedStart} IS NOT NULL AND ${t.confirmedEnd} IS NOT NULL AND ${t.confirmedAt} IS NOT NULL)
    AND (${t.confirmedStart} IS NULL OR ${t.confirmedEnd} >= ${t.confirmedStart})
    AND ((${t.confirmedFrom} IS NULL AND ${t.confirmedTo} IS NULL) OR (${t.confirmedFrom} IS NOT NULL AND ${t.confirmedTo} IS NOT NULL AND ${t.confirmedFrom} < ${t.confirmedTo}))`),
]).enableRLS();

/** 한 사람이 한 날짜에 한 줄. 다른 사람과 같은 줄을 쓰지 않아 응답끼리 충돌하지 않는다. */
export const meetingResponses = pgTable("meeting_responses", {
  meetingId: uuid("meeting_id").notNull().references(() => meetings.id, { onDelete: "cascade" }),
  day: date("day").notNull(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  answer: text("answer").$type<MeetingAnswer>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.meetingId, t.day, t.userId] }),
  index("meeting_responses_user_idx").on(t.userId, t.meetingId),
  check("meeting_responses_answer_check", sql`${t.answer} IN ('yes','maybe','no')`),
]).enableRLS();

/**
 * 홈 화면 개인 프로젝트 폴더. 프로젝트의 권한·원본과 무관한 "내 분류"일 뿐이라
 * 소유자(ownerId) 기준으로만 읽고 쓴다. 스페이스 권한 경계는 건드리지 않는다.
 */
export const projectFolders = pgTable("project_folders", {
  id: uuid("id").primaryKey(),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  // 두 기기에서 동시에 고칠 때 나중 저장이 앞선 저장을 조용히 덮지 않도록 낙관적 잠금을 둔다.
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  uniqueIndex("project_folders_owner_name_idx").on(t.ownerId, t.name),
  check("project_folders_name_check", sql`length(trim(${t.name})) BETWEEN 1 AND 40 AND ${t.version} > 0`),
]).enableRLS();

/**
 * 프로젝트 → 폴더 배정. 프로젝트당 한 폴더(기본키 owner+space)이고,
 * 폴더가 지워지면 배정만 cascade로 사라져 프로젝트는 "폴더 밖"으로 돌아간다.
 */
export const projectFolderAssignments = pgTable("project_folder_assignments", {
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  spaceId: uuid("space_id").notNull().references(() => spaces.id, { onDelete: "cascade" }),
  folderId: uuid("folder_id").notNull().references(() => projectFolders.id, { onDelete: "cascade" }),
}, t => [
  primaryKey({ columns: [t.ownerId, t.spaceId] }),
  index("project_folder_assignments_folder_idx").on(t.folderId),
]).enableRLS();
