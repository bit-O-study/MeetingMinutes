"use server";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSpaceMember } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { projectFolderAssignments as assignments, projectFolders as folders } from "@/lib/db/schema";

export type ProjectFolderData = {
  folders: { id: string; name: string; version: number }[];
  assignments: Record<string, string>;
};
type Result<T = null> = { ok: true; data: T } | { ok: false; error: string };

const name = z.string().trim().min(1, "폴더 이름을 입력해 주세요.").max(40, "폴더 이름은 40자 이하로 입력해 주세요.");
const id = z.string().uuid();
const versioned = z.object({ id, version: z.number().int().positive() }).strict();
// 다른 기기에서 먼저 바뀐 경우와 없는 경우를 구분하지 않고 같은 안내로 처리한다.
const conflict = { ok: false, error: "다른 화면에서 변경되었거나 폴더를 찾을 수 없어요. 새로고침한 뒤 다시 시도해 주세요." } as const;
const invalidate = () => revalidatePath("/");

/** 홈 렌더링용. 소유자 조건만으로 조회하므로 다른 사용자의 분류는 절대 섞이지 않는다. */
export async function listMyProjectFolders(): Promise<ProjectFolderData> {
  const user = await requireUser();
  const [rows, links] = await Promise.all([
    db.select({ id: folders.id, name: folders.name, version: folders.version }).from(folders)
      .where(eq(folders.ownerId, user.id)).orderBy(folders.createdAt),
    db.select({ spaceId: assignments.spaceId, folderId: assignments.folderId }).from(assignments)
      .where(eq(assignments.ownerId, user.id)),
  ]);
  return { folders: rows, assignments: Object.fromEntries(links.map(l => [l.spaceId, l.folderId])) };
}

export async function createProjectFolder(folderId: unknown, input: unknown): Promise<Result<{ id: string; name: string; version: number }>> {
  const user = await requireUser();
  const parsedId = id.safeParse(folderId), parsed = name.safeParse(input);
  if (!parsedId.success || !parsed.success) return { ok: false, error: parsed.success ? "요청을 확인해 주세요." : parsed.error.issues[0].message };
  try {
    const [row] = await db.insert(folders).values({ id: parsedId.data, ownerId: user.id, name: parsed.data })
      .onConflictDoNothing().returning({ id: folders.id, name: folders.name, version: folders.version });
    if (!row) {
      // 응답이 유실돼 같은 id로 재시도한 경우는 성공으로 돌려 복제하지 않는다.
      const [same] = await db.select({ id: folders.id, name: folders.name, version: folders.version }).from(folders)
        .where(and(eq(folders.id, parsedId.data), eq(folders.ownerId, user.id))).limit(1);
      if (same && same.name === parsed.data) return { ok: true, data: same };
      return { ok: false, error: "같은 이름의 폴더가 있어요." };
    }
    invalidate(); return { ok: true, data: row };
  } catch { return { ok: false, error: "폴더를 만들지 못했어요. 다시 시도해 주세요." }; }
}

export async function renameProjectFolder(identity: unknown, input: unknown): Promise<Result<{ version: number }>> {
  const user = await requireUser();
  const key = versioned.safeParse(identity), parsed = name.safeParse(input);
  if (!key.success || !parsed.success) return { ok: false, error: parsed.success ? "요청을 확인해 주세요." : parsed.error.issues[0].message };
  try {
    const [row] = await db.update(folders).set({ name: parsed.data, version: sql`${folders.version} + 1`, updatedAt: new Date() })
      .where(and(eq(folders.id, key.data.id), eq(folders.ownerId, user.id), eq(folders.version, key.data.version)))
      .returning({ version: folders.version });
    if (!row) return conflict;
    invalidate(); return { ok: true, data: row };
  } catch (e) {
    // 고유 인덱스 위반(23505)만 이름 중복으로 안내한다.
    const dup = (e as { code?: string; cause?: { code?: string } })?.code === "23505" || (e as { cause?: { code?: string } })?.cause?.code === "23505";
    return { ok: false, error: dup ? "같은 이름의 폴더가 있어요." : "이름을 바꾸지 못했어요. 다시 시도해 주세요." };
  }
}

/** 폴더만 지운다. 배정은 FK cascade로 사라지고 프로젝트는 폴더 밖으로 돌아간다. */
export async function deleteProjectFolder(identity: unknown): Promise<Result> {
  const user = await requireUser(); const key = versioned.safeParse(identity);
  if (!key.success) return { ok: false, error: "요청을 확인해 주세요." };
  try {
    const [row] = await db.delete(folders)
      .where(and(eq(folders.id, key.data.id), eq(folders.ownerId, user.id), eq(folders.version, key.data.version)))
      .returning({ id: folders.id });
    if (!row) return conflict;
    invalidate(); return { ok: true, data: null };
  } catch { return { ok: false, error: "폴더를 삭제하지 못했어요. 다시 시도해 주세요." }; }
}

/** folderId가 null이면 폴더 밖으로 되돌린다. 멤버가 아닌 프로젝트는 옮길 수 없다. */
export async function moveProjectToFolder(spaceId: unknown, folderId: unknown): Promise<Result> {
  const user = await requireUser();
  const space = id.safeParse(spaceId), folder = id.nullable().safeParse(folderId);
  if (!space.success || !folder.success) return { ok: false, error: "요청을 확인해 주세요." };
  await requireSpaceMember(space.data);
  try {
    if (folder.data === null) {
      await db.delete(assignments).where(and(eq(assignments.ownerId, user.id), eq(assignments.spaceId, space.data)));
    } else {
      // 내 폴더인지 먼저 확인해 남의 폴더 id로 배정하는 것을 막는다.
      const [own] = await db.select({ id: folders.id }).from(folders)
        .where(and(eq(folders.id, folder.data), eq(folders.ownerId, user.id))).limit(1);
      if (!own) return conflict;
      await db.insert(assignments).values({ ownerId: user.id, spaceId: space.data, folderId: folder.data })
        .onConflictDoUpdate({ target: [assignments.ownerId, assignments.spaceId], set: { folderId: folder.data } });
    }
    invalidate(); return { ok: true, data: null };
  } catch { return { ok: false, error: "프로젝트를 옮기지 못했어요. 다시 시도해 주세요." }; }
}
