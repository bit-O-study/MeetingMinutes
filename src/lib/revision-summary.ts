/**
 * 변경 이력에 붙일 한 줄 요약을 만든다.
 *
 * "박OO · 2시간 전" 만 보여 주면 목록을 훑어도 어느 시점으로 돌아갈지 고를 수 없다.
 * 어느 항목이 바뀌었는지가 있어야 이력이 쓸모 있어진다.
 *
 * 템플릿이 문서를 제목(heading) 단위로 나누므로, 제목을 경계로 묶어
 * 어느 구획의 내용이 달라졌는지 비교한다.
 */

export type Section = { heading: string; text: string };

type JsonNode = {
  type?: string;
  attrs?: Record<string, unknown>;
  text?: string;
  content?: JsonNode[];
};

/** 제목이 나오기 전의 앞머리. 스터디 템플릿의 회차·참석 줄이 여기 들어간다. */
const PREAMBLE = "머리말";

export function sectionsFromDoc(doc: unknown): Section[] {
  const root = doc as JsonNode | null;
  if (!root?.content) return [];

  const sections: Section[] = [];
  let current: Section = { heading: PREAMBLE, text: "" };

  for (const node of root.content) {
    if (node.type === "heading") {
      // 앞머리가 비어 있으면 굳이 구획으로 남기지 않는다.
      if (current.text.trim() || current.heading !== PREAMBLE) sections.push(current);
      current = { heading: plainText(node) || "제목 없음", text: "" };
      continue;
    }
    current.text += plainText(node) + "\n";
  }
  // 빈 앞머리는 구획이 아니다. 남기면 빈 문서가 구획 하나짜리로 보여서
  // 첫 작성이 "노트 작성"이 아니라 "머리말 삭제"까지 붙은 문장이 된다.
  if (current.text.trim() || current.heading !== PREAMBLE) sections.push(current);

  return sections.map((s) => ({ heading: s.heading, text: s.text.trim() }));
}

function plainText(node: JsonNode): string {
  if (node.type === "text") return node.text ?? "";

  const inner = (node.content ?? []).map(plainText).join(" ");
  // 체크 상태가 바뀐 것도 변경으로 잡아야 한다. 글자만 보면 놓친다.
  if (node.type === "taskItem") {
    return `${node.attrs?.checked ? "[x]" : "[ ]"} ${inner}`;
  }
  return inner;
}

/**
 * 두 시점의 구획을 비교해 요약 문구를 만든다.
 * 바뀐 게 없으면 null — 리비전을 남기지 않는다는 뜻이다.
 */
export function summarizeChange(prev: Section[], next: Section[]): string | null {
  if (prev.length === 0) return next.length > 0 ? "노트 작성" : null;

  const before = new Map(prev.map((s) => [s.heading, s.text]));
  const after = new Map(next.map((s) => [s.heading, s.text]));

  const added: string[] = [];
  const edited: string[] = [];
  const removed: string[] = [];

  for (const [heading, text] of after) {
    if (!before.has(heading)) {
      if (text) added.push(heading);
    } else if (before.get(heading) !== text) {
      edited.push(heading);
    }
  }
  for (const heading of before.keys()) {
    if (!after.has(heading)) removed.push(heading);
  }

  const parts: string[] = [];
  if (added.length) parts.push(`${label(added)} 추가`);
  if (edited.length) parts.push(`${label(edited)} 수정`);
  if (removed.length) parts.push(`${label(removed)} 삭제`);

  if (parts.length === 0) return null;
  return parts.join(" · ");
}

/** 구획이 셋 이상 바뀌면 이름을 다 늘어놓지 않는다. 한 줄에 들어가야 한다. */
function label(headings: string[]): string {
  if (headings.length === 1) return headings[0];
  if (headings.length === 2) return headings.join(" · ");
  return `${headings[0]} 외 ${headings.length - 1}곳`;
}
