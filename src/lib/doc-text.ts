/**
 * Tiptap JSON에서 글자를 뽑는다. 검색용 평문(docToPlainText)과 이력 구획(revision-summary)이 함께 쓴다.
 *
 * ── 인라인 노드 사이에는 공백을 넣지 않는다 ─────────────────────
 * 굵게·기울임 같은 서식이 바뀌는 곳에서 텍스트 노드가 쪼개진다("회의**록**" → "회의", "록").
 * 예전에는 모든 노드를 공백으로 이어서 "회의 록"이 되었고, "회의록"으로 검색하면 빠졌다.
 * 블록(문단·제목·목록 항목) 사이에만 공백을 넣는다. 줄바꿈(hardBreak)은 공백 하나다.
 */

export type JsonNode = {
  type?: string;
  attrs?: Record<string, unknown>;
  text?: string;
  content?: unknown[];
};

/** 문단 안에 놓이는 노드. 이것들끼리는 붙여 쓴다. */
const INLINE = new Set(["text", "hardBreak", "mention", "emoji"]);

const isInline = (node: unknown) =>
  typeof node === "object" && node !== null && INLINE.has((node as JsonNode).type ?? "");

export function docText(node: unknown, decorate?: (node: JsonNode, inner: string) => string): string {
  if (!node || typeof node !== "object") return "";
  const n = node as JsonNode;
  if (n.type === "text") return typeof n.text === "string" ? n.text : "";
  if (n.type === "hardBreak") return " ";

  const children = Array.isArray(n.content) ? n.content : [];
  let inner = "";
  children.forEach((child, index) => {
    if (index > 0 && !(isInline(children[index - 1]) && isInline(child))) inner += " ";
    inner += docText(child, decorate);
  });
  return decorate ? decorate(n, inner) : inner;
}
