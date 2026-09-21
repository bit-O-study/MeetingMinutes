import {
  boolean,
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
   Auth.js (구글 로그인)
   ──────────────────────────────────────────────────────────── */

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name"),
  email: text("email").notNull(),
  emailVerified: timestamp("email_verified", { withTimezone: true }),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

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
    /** 되돌리기용 시점 스냅샷 */
    state: bytea("state"),
    /** "막힌 것 추가" 처럼 목록에 보여 줄 한 줄 */
    summary: text("summary"),
    /** 되돌리기로 생성된 리비전인지 */
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
export type NewNote = typeof notes.$inferInsert;
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type NoteRevision = typeof noteRevisions.$inferSelect;
export type ShareLink = typeof shareLinks.$inferSelect;
