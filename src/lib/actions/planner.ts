"use server";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { meetings, personalPlannerItems as items, spaceMembers } from "@/lib/db/schema";
import { plannerFields, plannerInput, type PlannerItem } from "@/lib/planner";
import { plannerItem } from "@/lib/planner-data";

type Result = { ok: true; item: PlannerItem | null } | { ok: false; error: string };
const key = z.object({ id: z.string().uuid(), version: z.number().int().nonnegative() }).strict();
function invalidate() { revalidatePath("/", "layout"); }
/**
 * 연결 대상은 내 일정이거나 내가 속한 스페이스의 모임이어야 한다. 남의 일정·모임 id 를 넣어
 * 제목을 훔쳐보거나 엉뚱한 곳에 매다는 것을 막는다.
 */
async function linkAllowed(userId: string, linkedItemId: string | null | undefined, linkedMeetingId: string | null | undefined): Promise<boolean> {
  if (linkedItemId) {
    const [row] = await db.select({ id: items.id }).from(items).where(and(eq(items.id, linkedItemId), eq(items.ownerId, userId), eq(items.kind, "event"))).limit(1);
    if (!row) return false;
  }
  if (linkedMeetingId) {
    const [row] = await db.select({ id: meetings.id }).from(meetings)
      .innerJoin(spaceMembers, and(eq(spaceMembers.spaceId, meetings.spaceId), eq(spaceMembers.userId, userId)))
      .where(eq(meetings.id, linkedMeetingId)).limit(1);
    if (!row) return false;
  }
  return true;
}
const conflict: Result = { ok: false, error: "다른 화면에서 변경되었거나 항목을 찾을 수 없습니다. 닫고 새로고침한 뒤 다시 열어 주세요." };

export async function savePlannerItem(identity: unknown, input: unknown): Promise<Result> {
  const user = await requireUser();
  const parsedKey = key.safeParse(identity), parsed = plannerInput.safeParse(input);
  if (!parsedKey.success || !parsed.success) return { ok: false, error: !parsed.success ? parsed.error.issues[0].message : "요청을 확인해 주세요." };
  const { id, version } = parsedKey.data;
  if (!(await linkAllowed(user.id, parsed.data.linkedItemId, parsed.data.linkedMeetingId))) return { ok: false, error: "연결할 수 없는 일정이에요. 목록에서 다시 골라 주세요." };
  try {
    const fields = plannerFields(parsed.data);
    let row;
    if (version === 0) {
      [row] = await db.insert(items).values({ id, ownerId: user.id, ...fields }).onConflictDoNothing().returning();
      // 응답이 유실되어 같은 등록을 재시도해도 복제하지 않는다.
      if (!row) [row] = await db.select().from(items).where(and(eq(items.id, id), eq(items.ownerId, user.id))).limit(1);
    } else {
      [row] = await db.update(items).set({ ...fields, version: sql`${items.version} + 1`, updatedAt: new Date() })
        .where(and(eq(items.id, id), eq(items.ownerId, user.id), eq(items.version, version), eq(items.kind, fields.kind))).returning();
    }
    if (!row) return conflict;
    invalidate(); return { ok: true, item: plannerItem(row) };
  } catch { return { ok: false, error: "저장하지 못했습니다. 입력한 내용은 유지됩니다. 다시 시도해 주세요." }; }
}
export async function completePlannerItem(identity: unknown, done: unknown): Promise<Result> {
  const user = await requireUser(); const parsed = key.safeParse(identity);
  if (!parsed.success || typeof done !== "boolean") return { ok: false, error: "요청을 확인해 주세요." };
  try {
    const [row] = await db.update(items).set({ doneAt: done ? new Date() : null, version: sql`${items.version} + 1`, updatedAt: new Date() })
      .where(and(eq(items.id, parsed.data.id), eq(items.version, parsed.data.version), eq(items.ownerId, user.id), eq(items.kind, "task"))).returning();
    if (!row) return conflict;
    invalidate(); return { ok: true, item: plannerItem(row) };
  } catch { return { ok: false, error: "완료 상태를 바꾸지 못했습니다. 다시 시도해 주세요." }; }
}
export async function deletePlannerItem(identity: unknown): Promise<Result> {
  const user = await requireUser(); const parsed = key.safeParse(identity);
  if (!parsed.success) return { ok: false, error: "요청을 확인해 주세요." };
  try {
    const [row] = await db.delete(items).where(and(eq(items.id, parsed.data.id), eq(items.version, parsed.data.version), eq(items.ownerId, user.id))).returning({ id: items.id });
    if (!row) return conflict;
    invalidate(); return { ok: true, item: null };
  } catch { return { ok: false, error: "삭제하지 못했습니다. 다시 시도해 주세요." }; }
}
