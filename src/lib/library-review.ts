import { attachmentIdPattern } from "./attachment-input";
export const reviewStates = ["pending", "reviewed", "hold"] as const;
export type ReviewState = typeof reviewStates[number];
export function reviewInput(input: unknown) {
  if (!input || typeof input !== "object") throw new Error("검수 내용을 확인해 주세요.");
  const value = input as Record<string, unknown>;
  if (typeof value.id !== "string" || !attachmentIdPattern.test(value.id) || !reviewStates.includes(value.status as ReviewState) || typeof value.note !== "string" || value.note.length > 1000) throw new Error("검수 내용은 1,000자 이내로 입력해 주세요.");
  return { id: value.id, status: value.status as ReviewState, note: value.note.trim() };
}
