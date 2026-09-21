import { notFound } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { notes, spaceMembers, spaces } from "@/lib/db/schema";
import type { MemberRole } from "@/lib/db/schema";

/**
 * 권한 검사는 전부 이 파일을 통한다.
 *
 * 스페이스가 유일한 권한 경계이므로 확인할 것이 하나뿐이다.
 * 노트 단위 권한은 없다 — 비공개가 필요하면 스페이스를 따로 만든다.
 */

/**
 * 권한 없음과 존재하지 않음을 구분하지 않는다. 존재 여부 자체가 정보다.
 *
 * 그래서 403이 아니라 `notFound()`를 쓴다. 상태 코드 404가 나가고
 * `app/(app)/not-found.tsx`가 렌더된다. 응답만 봐도 회의가 있는지 알 수 없다.
 */
function denied(): never {
  notFound();
}

export type SpaceAccess = {
  userId: string;
  space: typeof spaces.$inferSelect;
  role: MemberRole;
};

/** 스페이스 멤버인지 확인한다. 아니면 던진다. */
export async function requireSpaceMember(spaceId: string): Promise<SpaceAccess> {
  const user = await requireUser();

  const [row] = await db
    .select({ space: spaces, role: spaceMembers.role })
    .from(spaceMembers)
    .innerJoin(spaces, eq(spaces.id, spaceMembers.spaceId))
    .where(
      and(
        eq(spaceMembers.spaceId, spaceId),
        eq(spaceMembers.userId, user.id),
        isNull(spaces.deletedAt),
      ),
    )
    .limit(1);

  if (!row) denied();
  return { userId: user.id, space: row.space, role: row.role };
}

/** 소유자만 할 수 있는 동작(초대, 스페이스 삭제·이름 변경)에 쓴다. */
export async function requireSpaceOwner(spaceId: string): Promise<SpaceAccess> {
  const access = await requireSpaceMember(spaceId);
  if (access.role !== "owner") denied();
  return access;
}

export type NoteAccess = SpaceAccess & { note: typeof notes.$inferSelect };

/** 노트를 열 때 쓴다. 노트가 속한 스페이스의 멤버십을 확인한다. */
export async function requireNoteAccess(noteId: string): Promise<NoteAccess> {
  const user = await requireUser();

  const [row] = await db
    .select({ note: notes, space: spaces, role: spaceMembers.role })
    .from(notes)
    .innerJoin(spaces, eq(spaces.id, notes.spaceId))
    .innerJoin(
      spaceMembers,
      and(eq(spaceMembers.spaceId, spaces.id), eq(spaceMembers.userId, user.id)),
    )
    .where(and(eq(notes.id, noteId), isNull(notes.deletedAt), isNull(spaces.deletedAt)))
    .limit(1);

  if (!row) denied();
  return { userId: user.id, space: row.space, role: row.role, note: row.note };
}

/** 내가 속한 스페이스 목록. 사이드바와 전역 검색 범위가 된다. */
export async function listMySpaces() {
  const user = await requireUser();

  return db
    .select({ space: spaces, role: spaceMembers.role })
    .from(spaceMembers)
    .innerJoin(spaces, eq(spaces.id, spaceMembers.spaceId))
    .where(and(eq(spaceMembers.userId, user.id), isNull(spaces.deletedAt)))
    .orderBy(spaces.lastActivityAt);
}

/** 내가 속한 스페이스 id 목록. 검색 쿼리의 권한 필터로 쓴다 — 조회 이전에 적용할 것. */
export async function mySpaceIds(): Promise<string[]> {
  const rows = await listMySpaces();
  return rows.map((r) => r.space.id);
}
