import { z } from "zod";

export const ISSUE_STATUSES = { open: "열림", in_progress: "진행 중", closed: "해결됨" } as const;
export const ISSUE_PRIORITIES = { low: "낮음", normal: "보통", high: "높음" } as const;
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

export type IssueState = { ok: boolean; message: string };
