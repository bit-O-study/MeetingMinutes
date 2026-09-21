import type { TemplateKind, SpaceKind } from "@/lib/db/schema";

/**
 * 템플릿이 이 시스템의 실질적 가치다. 빈 문서를 주면 아무도 안 쓴다.
 *
 * 문서는 Tiptap JSON으로 저장한다. StarterKit + TaskList/TaskItem 노드만 쓰므로
 * 별도 확장 없이 그대로 렌더된다.
 */

type Doc = { type: "doc"; content: unknown[] };

const h = (text: string) => ({
  type: "heading",
  attrs: { level: 2 },
  content: [{ type: "text", text }],
});

const p = (text?: string) =>
  text
    ? { type: "paragraph", content: [{ type: "text", text }] }
    : { type: "paragraph" };

/** 안내 문구. 사용자가 지우고 쓰면 된다. */
const hint = (text: string) => ({
  type: "paragraph",
  content: [{ type: "text", marks: [{ type: "italic" }], text }],
});

/** 미해결 항목. 체크 가능한 목록. */
const checks = (items: string[]) => ({
  type: "taskList",
  content: items.map((text) => ({
    type: "taskItem",
    attrs: { checked: false },
    content: [p(text)],
  })),
});

const warn = (text: string) => ({
  type: "blockquote",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

/* ────────────────────────────────────────────────────────────
   01 · 개발 스터디 회의록
   ──────────────────────────────────────────────────────────── */

function studyDoc(sessionNo: number): Doc {
  return {
    type: "doc",
    content: [
      p(`${sessionNo}회차 · 참석: · 이번 범위: · 발표·정리 담당:`),

      h("배운 것"),
      hint("핵심 개념 · 코드 · 예시"),
      p(),

      // 스터디에서 가치 있는 기록은 이해한 것이 아니라 아직 이해 못 한 것이다.
      // 해결 여부를 추적하면 다음 회차 논의거리가 자동으로 생긴다.
      h("막힌 것 · 질문"),
      checks([""]),

      // 여기 입력한 항목이 곧 할 일이 된다. 할 일을 또 만들게 하지 않는다.
      h("다음 회차"),
      checks([""]),
    ],
  };
}

/* ────────────────────────────────────────────────────────────
   02 · 인수인계 메모
   ──────────────────────────────────────────────────────────── */

function handoverDoc(): Doc {
  return {
    type: "doc",
    content: [
      p("대상 업무: · 인계자 → 인수자: · 현재 상태:"),

      h("이 업무가 하는 일"),
      hint("한 문단 요약"),
      p(),

      h("접근 권한 · 계정"),
      // 경고를 문서 상단 공지가 아니라 입력란 바로 위에 둔다.
      // 값을 붙여 넣으려고 커서를 가져가는 그 자리에 있어야 읽는다.
      warn("⚠ 비밀번호·토큰·키 값은 적지 마세요. 무엇이 필요한지, 어디에 있는지, 누구에게 요청하는지만 적습니다."),
      p(),

      h("정기적으로 하는 일"),
      hint("주기 · 절차 · 확인 지점"),
      p(),

      // 정상 절차는 코드를 보면 알지만, "이건 이래서 이렇게 해야 한다"는
      // 넘기는 사람 머릿속에만 있다. 이 블록이 인수인계 문서의 핵심이다.
      h("주의사항 · 함정"),
      hint("실수하기 쉬운 것 · 과거에 터진 것"),
      p(),

      h("관련 문서 · 사람"),
      p(),

      h("미완료 건"),
      checks([""]),

      h("인수자 질문"),
      hint("받는 사람이 여기에 바로 적습니다."),
      checks([""]),
    ],
  };
}

/* ────────────────────────────────────────────────────────────
   03 · 빈 노트
   ──────────────────────────────────────────────────────────── */

function blankDoc(): Doc {
  return { type: "doc", content: [p()] };
}

/* ──────────────────────────────────────────────────────────── */

export type TemplateMeta = {
  kind: TemplateKind;
  label: string;
  blurb: string;
  /** 제목 자동 생성. 스터디는 회차가 규칙적이라 미리 채워 준다. */
  defaultTitle: (ctx: { sessionNo: number; today: Date }) => string;
  /** 회차 번호를 쓰는 템플릿인지 */
  usesSessionNo: boolean;
};

export const TEMPLATES: Record<TemplateKind, TemplateMeta> = {
  study: {
    kind: "study",
    label: "스터디 회의록",
    blurb: "범위 · 배운 것 · 막힌 것 · 다음 회차",
    defaultTitle: ({ sessionNo }) => `${sessionNo}회차`,
    usesSessionNo: true,
  },
  handover: {
    kind: "handover",
    label: "인수인계 메모",
    blurb: "절차 · 주의사항 · 미완료 건",
    defaultTitle: () => "인수인계 메모",
    usesSessionNo: false,
  },
  blank: {
    kind: "blank",
    label: "빈 노트",
    blurb: "제목과 본문만",
    defaultTitle: ({ today }) =>
      `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
        today.getDate(),
      ).padStart(2, "0")} 메모`,
    usesSessionNo: false,
  },
};

export const TEMPLATE_ORDER: TemplateKind[] = ["study", "handover", "blank"];

/** 스페이스 용도에 맞는 템플릿이 기본 선택되어 있어야 한다. */
export function defaultTemplateFor(kind: SpaceKind): TemplateKind {
  if (kind === "study") return "study";
  if (kind === "handover") return "handover";
  return "blank";
}

export function buildTemplateDoc(kind: TemplateKind, sessionNo = 1): Doc {
  if (kind === "study") return studyDoc(sessionNo);
  if (kind === "handover") return handoverDoc();
  return blankDoc();
}

/** 검색용 평문 추출. content 저장 시 plainText를 함께 갱신한다. */
export function docToPlainText(doc: unknown): string {
  const out: string[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const n = node as { type?: string; text?: string; content?: unknown[] };
    if (n.type === "text" && n.text) out.push(n.text);
    n.content?.forEach(walk);
  };
  walk(doc);
  return out.join(" ").replace(/\s+/g, " ").trim();
}
