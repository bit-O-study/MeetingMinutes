"use server";

import { and, count, desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireSpaceMember } from "@/lib/access";
import { db } from "@/lib/db";
import { issues, projectMessages } from "@/lib/db/schema";
import { chatMessageInput, messageIssueInput, rawIssueTitle, type IssueState } from "@/lib/issue-input";

export async function listProjectMessages(spaceId: string, page = 1) {
  await requireSpaceMember(spaceId);
  const safePage = Number.isSafeInteger(page) ? Math.max(1, Math.min(page, 10000)) : 1;
  const [rows, totals] = await Promise.all([
    db.select({ id: projectMessages.id, body: projectMessages.body, createdBy: projectMessages.createdBy,
      createdAt: projectMessages.createdAt, issueId: issues.id, issueStatus: issues.status })
      .from(projectMessages).leftJoin(issues, and(eq(issues.sourceMessageId, projectMessages.id), eq(issues.spaceId, spaceId)))
      .where(eq(projectMessages.spaceId, spaceId)).orderBy(desc(projectMessages.createdAt), desc(projectMessages.id))
      .limit(30).offset((safePage - 1) * 30),
    db.select({ total: count() }).from(projectMessages).where(eq(projectMessages.spaceId, spaceId)),
  ]);
  return { rows, total: totals[0]?.total ?? 0, page: safePage };
}

export async function sendProjectMessage(input: unknown): Promise<IssueState> {
  const parsed = chatMessageInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { spaceId, id, body } = parsed.data;
  const { userId } = await requireSpaceMember(spaceId);
  const [inserted] = await db.insert(projectMessages).values({ id, spaceId, body, createdBy: userId }).onConflictDoNothing({ target: projectMessages.id }).returning({ body: projectMessages.body });
  const [saved] = inserted ? [inserted] : await db.select({ body: projectMessages.body }).from(projectMessages)
    .where(and(eq(projectMessages.id, id), eq(projectMessages.spaceId, spaceId), eq(projectMessages.createdBy, userId))).limit(1);
  if (!saved || saved.body !== body) return { ok: false, message: "전송 결과를 확인할 수 없습니다. 다시 시도하세요." };
  revalidatePath(`/s/${spaceId}`);
  return { ok: true, message: "메시지를 보냈습니다." };
}

/** 클라이언트가 보낸 본문 대신 접근 가능한 채팅 원문을 읽어 미가공 이슈로 복사한다. */
export async function captureMessageIssue(input: unknown): Promise<IssueState> {
  const parsed = messageIssueInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: "메시지를 확인하세요." };
  const { spaceId, messageId } = parsed.data;
  const { userId } = await requireSpaceMember(spaceId);
  const captured = await db.transaction(async tx => {
    // 삭제와 담기가 같은 원문 행을 먼저 잠가 외래 키 오류와 원문 유실을 막는다.
    const [message] = await tx.select().from(projectMessages)
      .where(and(eq(projectMessages.id, messageId), eq(projectMessages.spaceId, spaceId))).limit(1).for("update");
    if (!message) return false;
    // 고유 인덱스로 여러 멤버의 동시 클릭과 재시도를 한 이슈로 수렴시킨다.
    await tx.insert(issues).values({ spaceId, sourceMessageId: message.id, originalBody: message.body,
      body: message.body, title: rawIssueTitle(message.body), status: "raw", createdBy: userId })
      .onConflictDoNothing({ target: issues.sourceMessageId });
    return true;
  });
  if (!captured) return { ok: false, message: "메시지를 확인할 수 없습니다. 새로고침 후 확인하세요." };
  revalidatePath(`/s/${spaceId}`);
  return { ok: true, message: "검토함에 후보로 담았습니다." };
}

export async function deleteProjectMessage(input: unknown): Promise<IssueState> {
  const parsed = messageIssueInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: "메시지를 확인하세요." };
  const { spaceId, messageId } = parsed.data;
  const { userId } = await requireSpaceMember(spaceId);
  const deleted = await db.transaction(async tx => {
    // 소유자도 다른 사람의 메시지는 지우지 못한다. 권한과 존재 여부를 같은 조건으로 확인한다.
    const condition = and(eq(projectMessages.id, messageId), eq(projectMessages.spaceId, spaceId), eq(projectMessages.createdBy, userId));
    const [message] = await tx.select().from(projectMessages).where(condition).limit(1).for("update");
    if (!message) return false;
    // 기존 이슈의 사본이 비어 있어도 삭제 전 보완한다. FK의 SET NULL은 이슈 자체를 보존한다.
    await tx.update(issues).set({ originalBody: sql`coalesce(${issues.originalBody}, ${message.body})` })
      .where(and(eq(issues.sourceMessageId, messageId), eq(issues.spaceId, spaceId)));
    await tx.delete(projectMessages).where(condition);
    return true;
  });
  revalidatePath(`/s/${spaceId}`);
  if (!deleted) return { ok: false, message: "메시지를 삭제할 수 없습니다. 새로고침 후 확인하세요." };
  return { ok: true, message: "메시지를 삭제했습니다. 연결된 이슈와 원문 사본은 유지됩니다." };
}
