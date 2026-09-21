"use server";

import { and, asc, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";

import { mySpaceIds, requireSpaceMember } from "@/lib/access";
import { db } from "@/lib/db";
import { notes, spaces } from "@/lib/db/schema";
import type { NoteStatus } from "@/lib/db/schema";
import { countOpenQuestions } from "@/lib/questions";
import { sectionsFromDoc } from "@/lib/revision-summary";

/* ────────────────────────────────────────────────────────────
   검색
   ──────────────────────────────────────────────────────────── */

export type SearchOptions = {
  /** 좁히고 싶은 스페이스. 비우면 내가 속한 전부. */
  spaceIds?: string[];
  /** Asia/Seoul 기준 YYYY-MM-DD */
  from?: string | null;
  to?: string | null;
  status?: NoteStatus | null;
  limit?: number;
};

export type SearchHit = {
  id: string;
  title: string;
  spaceId: string;
  spaceName: string;
  status: NoteStatus;
  updatedAt: Date;
  /** 일치 문장 발췌 */
  snippet: string;
  /** 어느 구획에서 나왔는지. "막힌 것 · 질문"에서 나온 결과가 가장 쓸모 있다. */
  section: string | null;
};

export type SearchResult = {
  /** limit에 걸리기 전 전체 건수. "N건"을 보여 주려면 따로 세야 한다. */
  total: number;
  hits: SearchHit[];
};

/**
 * 내가 속한 스페이스 안에서만 찾는다.
 *
 * ★ 권한 범위를 **조회 이전에** 확정한다. 결과를 받아 놓고 거르면
 *   건수만으로도 정보가 샌다.
 *
 * 1차는 plainText ILIKE로 충분하다. 규모가 커지면 tsvector + pg_trgm으로 옮긴다.
 */
export async function searchNotes(
  query: string,
  opts: SearchOptions = {},
): Promise<SearchResult> {
  const q = query.trim();
  if (!q) return { total: 0, hits: [] };

  const allowed = await mySpaceIds();
  const scope = opts.spaceIds?.length
    ? allowed.filter((id) => opts.spaceIds!.includes(id))
    : allowed;

  // 요청한 스페이스가 내 범위 밖이면 빈 결과다. 범위를 넓히지 않는다.
  if (scope.length === 0) return { total: 0, hits: [] };

  const pattern = `%${q}%`;

  /*
    조건을 한 번만 적고 목록·집계에 함께 쓴다.
    두 벌로 적으면 한쪽만 고쳐져서 "12건"이라 써 놓고 3건만 나오는 일이 생긴다.
  */
  const where = and(
    inArray(notes.spaceId, scope),
    isNull(notes.deletedAt),
    isNull(spaces.deletedAt),
    or(ilike(notes.title, pattern), ilike(notes.plainText, pattern)),
    opts.status ? eq(notes.status, opts.status) : undefined,
    opts.from ? sql`${notes.updatedAt} >= ${opts.from}::date` : undefined,
    // 종료일은 그날 하루를 포함해야 한다. 사용자는 날짜를 골랐지 자정을 고른 게 아니다.
    opts.to ? sql`${notes.updatedAt} < (${opts.to}::date + interval '1 day')` : undefined,
  );

  const [[counted], rows] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(notes)
      .innerJoin(spaces, eq(spaces.id, notes.spaceId))
      .where(where),
    db
      .select({
        id: notes.id,
        title: notes.title,
        spaceId: notes.spaceId,
        spaceName: spaces.name,
        status: notes.status,
        updatedAt: notes.updatedAt,
        plainText: notes.plainText,
        content: notes.content,
      })
      .from(notes)
      .innerJoin(spaces, eq(spaces.id, notes.spaceId))
      .where(where)
      .orderBy(desc(notes.updatedAt), asc(notes.id))
      .limit(opts.limit ?? 30),
  ]);

  const hits = rows.map(({ plainText, content, ...note }): SearchHit => {
    const { snippet, section } = locate(q, plainText, content);
    return { ...note, snippet, section };
  });

  return { total: counted?.n ?? hits.length, hits };
}

/** 일치 지점 앞뒤를 잘라 발췌하고, 어느 구획에서 나왔는지 찾는다. */
function locate(q: string, plainText: string, content: unknown) {
  const lower = plainText.toLowerCase();
  const at = lower.indexOf(q.toLowerCase());

  const snippet =
    at < 0
      ? plainText.slice(0, 80)
      : (at > 20 ? "…" : "") +
        plainText.slice(Math.max(0, at - 20), at + q.length + 60).trim() +
        (at + q.length + 60 < plainText.length ? "…" : "");

  const section =
    sectionsFromDoc(content).find((s) => s.text.toLowerCase().includes(q.toLowerCase()))
      ?.heading ?? null;

  return { snippet, section };
}

/* ────────────────────────────────────────────────────────────
   미해결 질문 수 — S-02 노트 목록 배지
   ──────────────────────────────────────────────────────────── */

/**
 * 스페이스의 노트별 미해결 질문 수.
 *
 * content를 통째로 읽어 세므로 노트가 아주 많아지면 무거워진다.
 * 이 규모(스페이스당 수십 건)에서는 컬럼을 하나 더 두고 저장 시점마다
 * 갱신하는 것보다 어긋날 일이 없어 낫다.
 */
export async function openQuestionCounts(spaceId: string): Promise<Record<string, number>> {
  await requireSpaceMember(spaceId);

  const rows = await db
    .select({ id: notes.id, content: notes.content })
    .from(notes)
    .where(and(eq(notes.spaceId, spaceId), isNull(notes.deletedAt)));

  const out: Record<string, number> = {};
  for (const row of rows) {
    const n = countOpenQuestions(row.content);
    if (n > 0) out[row.id] = n;
  }
  return out;
}
