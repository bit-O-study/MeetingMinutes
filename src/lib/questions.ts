/**
 * 미해결 질문 수.
 *
 * 스터디에서 가치 있는 기록은 이해한 것이 아니라 **아직 이해 못 한 것**이다.
 * 노트 목록에 이 숫자가 있어야 다음 회차에 뭘 다룰지 목록만 보고 안다.
 *
 * ── 무엇을 질문으로 보는가 ─────────────────────────────────
 * 제목에 "질문"이 들어간 구획 안의 체크박스만 센다.
 * 스터디 템플릿의 `막힌 것 · 질문`, 인수인계 템플릿의 `인수자 질문`이 걸린다.
 * `다음 회차`나 `미완료 건` 같은 다른 할 일은 섞이지 않는다.
 *
 * 빈 항목은 세지 않는다. 템플릿이 빈 체크박스를 달고 오므로
 * 그냥 세면 새 노트가 전부 "질문 1"로 보인다.
 */

type JsonNode = {
  type?: string;
  attrs?: Record<string, unknown>;
  text?: string;
  content?: JsonNode[];
};

const QUESTION_MARK = "질문";

export function countOpenQuestions(doc: unknown): number {
  const root = doc as JsonNode | null;
  if (!root?.content) return 0;

  let inQuestionSection = false;
  let open = 0;

  for (const node of root.content) {
    if (node.type === "heading") {
      inQuestionSection = plainText(node).includes(QUESTION_MARK);
      continue;
    }
    if (!inQuestionSection) continue;
    open += countUnchecked(node);
  }

  return open;
}

function countUnchecked(node: JsonNode): number {
  if (node.type === "taskItem") {
    if (node.attrs?.checked) return 0;
    return plainText(node).trim() ? 1 : 0;
  }
  return (node.content ?? []).reduce((sum, child) => sum + countUnchecked(child), 0);
}

function plainText(node: JsonNode): string {
  if (node.type === "text") return node.text ?? "";
  return (node.content ?? []).map(plainText).join("");
}
