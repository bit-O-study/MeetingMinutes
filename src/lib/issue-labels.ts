/**
 * 이슈 상태·우선순위 표시 이름.
 *
 * issue-input.ts(zod 검증)에서 떼어 냈다. 화면 컴포넌트가 라벨 때문에 그 파일을 import 하면
 * zod 전체(수백 KB)가 프로젝트 화면 클라이언트 번들에 딸려 왔다. 클라이언트는 여기만 import 한다.
 */
export const ISSUE_STATUSES = { raw: "미가공 이슈", open: "열림", in_progress: "진행 중", closed: "해결됨" } as const;
export const ISSUE_PRIORITIES = { low: "낮음", normal: "보통", high: "높음" } as const;

export type IssueState = { ok: boolean; message: string };
