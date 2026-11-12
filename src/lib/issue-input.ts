import { z } from "zod";

// 라벨은 클라이언트도 쓰므로 zod 없는 파일에 둔다. 서버 쪽 기존 import를 위해 다시 내보낸다.
export { ISSUE_PRIORITIES, ISSUE_STATUSES, type IssueState } from "@/lib/issue-labels";
export const issueInput = z.object({
  spaceId: z.uuid(),
  id: z.uuid().optional(),
  version: z.coerce.number().int().positive().optional(),
  title: z.string().trim().min(1, "제목을 입력하세요.").max(200, "제목은 200자까지 입력할 수 있습니다."),
  body: z.string().trim().max(10000, "내용은 10,000자까지 입력할 수 있습니다."),
  status: z.enum(["open", "in_progress", "closed"]),
  priority: z.enum(["low", "normal", "high"]),
  assigneeId: z.uuid().nullable(),
}).refine((value) => !value.id || !!value.version, { message: "이슈를 새로고침 후 다시 수정하세요." });


export const chatMessageInput = z.object({
  spaceId: z.uuid(),
  id: z.uuid(),
  body: z.string().max(10000, "메시지는 10,000자까지 입력할 수 있습니다.").refine(value => value.trim().length > 0, "메시지를 입력하세요."),
});
export function rawIssueTitle(body: string) {
  return Array.from(body.trim().split(/\r?\n/)[0]).slice(0, 100).join("");
}

export const messageIssueInput = z.object({ spaceId: z.uuid(), messageId: z.uuid() });

export const rawIssueActionInput = z.object({ spaceId: z.uuid(), id: z.uuid(), version: z.coerce.number().int().positive(), operation: z.enum(["complete", "delete"]) });
