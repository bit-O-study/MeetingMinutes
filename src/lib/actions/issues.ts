"use server";

import { and, count, desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireSpaceMember } from "@/lib/access";
import { db } from "@/lib/db";
import { issues, spaceMembers } from "@/lib/db/schema";
import { rawIssueActionInput, issueInput, type IssueState } from "@/lib/issue-input";

export async function listIssues(spaceId: string, status?: "raw" | "open" | "in_progress" | "closed", page = 1, issueId?: string) {
  await requireSpaceMember(spaceId);
  const safePage = Number.isSafeInteger(page) ? Math.max(1, Math.min(page, 10000)) : 1;
  // 내 할 일의 직접 링크는 목록 페이지 수와 무관하게 원본 이슈 한 건을 연다.
  const selectedId = issueId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(issueId) ? issueId : undefined;
  const condition = and(eq(issues.spaceId, spaceId), status ? eq(issues.status, status) : undefined, selectedId ? eq(issues.id, selectedId) : undefined);
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
    const changed = await db.update(issues).set({ ...values, originalBody: sql`coalesce(${issues.originalBody}, case when ${issues.status} = 'raw' then ${issues.body} else null end)`, updatedAt: new Date(), version: sql`${issues.version} + 1` })
      .where(and(eq(issues.id, id), eq(issues.spaceId, spaceId), eq(issues.version, version!))).returning({ id: issues.id });
    if (!changed.length) return { ok: false, message: "이슈가 변경되었거나 접근할 수 없습니다. 새로고침 후 다시 시도하세요." };
  } else {
    await db.insert(issues).values({ ...values, spaceId, createdBy: userId });
  }
  revalidatePath(`/s/${spaceId}`);
  revalidatePath("/", "layout");
  return { ok: true, message: id ? "이슈를 수정했습니다." : "이슈를 등록했습니다." };
}

export async function resolveRawIssue(_previous: IssueState, form: FormData): Promise<IssueState> {
  const parsed = rawIssueActionInput.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: "이슈와 처리 방법을 확인하세요." };
  const { spaceId, id, version, operation } = parsed.data;
  await requireSpaceMember(spaceId);
  const condition = and(eq(issues.id, id), eq(issues.spaceId, spaceId), eq(issues.version, version), eq(issues.status, "raw"));
  const changed = operation === "delete"
    ? await db.delete(issues).where(condition).returning({ id: issues.id })
    : await db.update(issues).set({ status: "closed", originalBody: sql`coalesce(${issues.originalBody}, ${issues.body})`, updatedAt: new Date(), version: sql`${issues.version} + 1` }).where(condition).returning({ id: issues.id });
  if (!changed.length) return { ok: false, message: "이슈가 이미 변경되었거나 삭제되었습니다. 새로고침 후 확인하세요." };
  revalidatePath(`/s/${spaceId}`);
  revalidatePath("/", "layout");
  return { ok: true, message: operation === "delete" ? "미가공 이슈를 삭제했습니다. 채팅 원문은 유지됩니다." : "완료 처리했습니다. 해결됨 탭에서 확인할 수 있습니다." };
}
