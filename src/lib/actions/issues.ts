"use server";

import { and, count, desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireSpaceMember } from "@/lib/access";
import { db } from "@/lib/db";
import { issues, spaceMembers } from "@/lib/db/schema";
import { issueInput, type IssueState } from "@/lib/issue-input";

export async function listIssues(spaceId: string, status?: "open" | "in_progress" | "closed", page = 1) {
  await requireSpaceMember(spaceId);
  const safePage = Number.isSafeInteger(page) ? Math.max(1, Math.min(page, 10000)) : 1;
  const condition = and(eq(issues.spaceId, spaceId), status ? eq(issues.status, status) : undefined);
  const [rows, totals] = await Promise.all([
    db.select().from(issues).where(condition).orderBy(desc(issues.updatedAt), desc(issues.id)).limit(30).offset((safePage - 1) * 30),
    db.select({ total: count() }).from(issues).where(condition),
  ]);
  return { rows, total: totals[0]?.total ?? 0, page: safePage };
}

export async function saveIssue(_previous: IssueState, form: FormData): Promise<IssueState> {
  const parsed = issueInput.safeParse({
    spaceId: form.get("spaceId"), id: form.get("id") || undefined, version: form.get("version") || undefined,
    title: form.get("title"), body: form.get("body"), status: form.get("status"), priority: form.get("priority"), assigneeId: form.get("assigneeId") || null,
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { spaceId, id, version, ...values } = parsed.data;
  const { userId } = await requireSpaceMember(spaceId);
  if (values.assigneeId) {
    const [member] = await db.select({ id: spaceMembers.userId }).from(spaceMembers)
      .where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, values.assigneeId))).limit(1);
    if (!member) return { ok: false, message: "이 스페이스의 멤버에게만 배정할 수 있습니다." };
  }
  if (id) {
    const changed = await db.update(issues).set({ ...values, updatedAt: new Date(), version: sql`${issues.version} + 1` })
      .where(and(eq(issues.id, id), eq(issues.spaceId, spaceId), eq(issues.version, version!))).returning({ id: issues.id });
    if (!changed.length) return { ok: false, message: "이슈가 변경되었거나 접근할 수 없습니다. 새로고침 후 다시 시도하세요." };
  } else {
    await db.insert(issues).values({ ...values, spaceId, createdBy: userId });
  }
  revalidatePath(`/s/${spaceId}`);
  return { ok: true, message: id ? "이슈를 수정했습니다." : "이슈를 등록했습니다." };
}
