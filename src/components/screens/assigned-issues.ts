import "server-only";
import { cache } from "react";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { mySpaceIds } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { issues, spaces } from "@/lib/db/schema";

// 할 일로 복제하지 않고 이슈 원본을 읽는다. 탈퇴·삭제된 프로젝트는 조회 전에 제외한다.
export const assignedIssues = cache(async (status: "open" | "done" | "all" = "open") => {
  const [spaceIds, user] = await Promise.all([mySpaceIds(), requireUser()]);
  if (spaceIds.length === 0) return [];
  return db.select({ issue: issues, spaceName: spaces.name }).from(issues)
    .innerJoin(spaces, eq(spaces.id, issues.spaceId))
    .where(and(inArray(issues.spaceId, spaceIds), eq(issues.assigneeId, user.id),
      status === "open" ? ne(issues.status, "closed") : status === "done" ? eq(issues.status, "closed") : undefined))
    .orderBy(desc(issues.updatedAt), desc(issues.id));
});
