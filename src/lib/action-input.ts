import { z } from "zod";

/**
 * 서버 액션이 받는 값의 스키마.
 *
 * 서버 액션은 네트워크 경계다. 타입스크립트 타입은 런타임에 남지 않으므로
 * `updateTask(taskId, patch)`의 `patch`에 무엇이 들어올지는 아무도 보장하지 않는다.
 * 실제로 drizzle의 `set()`은 넘어온 키를 그대로 컬럼에 매핑하기 때문에,
 * 타입에 없는 `spaceId`·`noteId`를 보내면 그대로 UPDATE 된다.
 *
 * 그래서 **허용할 필드를 여기 적고, 액션은 파싱된 값만 쓴다.**
 * zod의 기본 동작이 모르는 키를 떨어뜨리는 것이라 allowlist가 공짜로 된다.
 *
 * 로그인 입력은 `login-input.ts`에 따로 있다. 인증은 검증 규칙(길이·정규화)이
 * 화면과 붙어 있어 같이 두는 편이 읽기 쉽다.
 */

/** DB가 uuid 컬럼에 형식 오류로 500을 내기 전에 여기서 막는다. */
const uuid = z.string().uuid();

/**
 * Asia/Seoul 기준 날짜. 형식만 맞고 존재하지 않는 날(2026-02-31)은 걸러야 한다.
 * Date로 되돌렸을 때 같은 문자열이 나오는지로 확인한다.
 */
export const seoulDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식이어야 합니다.")
  .refine(
    (value) => {
      // 없는 날짜는 Invalid Date가 되고, 그 상태로 toISOString()을 부르면 던진다.
      const date = new Date(`${value}T00:00:00Z`);
      return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
    },
    { message: "없는 날짜입니다." },
  );

/** 할 일 문구. 본문 한 줄에서 오는 값이라 길 이유가 없다. */
const taskBody = z.string().trim().min(1, "내용을 입력하세요.").max(2000);

export const createTaskInput = z.object({
  noteId: uuid,
  body: taskBody,
  assigneeId: uuid.nullish(),
  dueDate: seoulDate.nullish(),
  blockId: z.string().max(64).nullish(),
});

/**
 * 담당자·기한·문구만 바꿀 수 있다.
 * `noteId`·`spaceId`·`doneAt`은 여기 없다 — 할 일이 어느 노트의 것인지는
 * 본문이 정하고, 완료 여부는 `toggleTask` 계열이 따로 다룬다.
 */
export const taskPatchInput = z
  .object({
    body: taskBody.optional(),
    assigneeId: uuid.nullable().optional(),
    dueDate: seoulDate.nullable().optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, { message: "바꿀 값이 없습니다." });

export type TaskPatchInput = z.infer<typeof taskPatchInput>;

/**
 * 검색 폼은 비어 있는 칸을 빈 문자열로 보낸다. 그걸 "값 없음"으로 받지 않으면
 * 날짜를 고르지 않은 평범한 검색이 형식 오류로 죽는다.
 */
const blank = (value: unknown) => (value === "" || value === null ? undefined : value);

export const searchOptionsInput = z.object({
  spaceIds: z.array(uuid).max(100).optional(),
  from: z.preprocess(blank, seoulDate.optional()),
  to: z.preprocess(blank, seoulDate.optional()),
  status: z.preprocess(blank, z.enum(["draft", "tidied"]).optional()),
  // 화면은 30을 쓴다. 상한을 두지 않으면 한 번에 전부 끌어올 수 있다.
  limit: z.number().int().min(1).max(100).default(30),
});

/* ────────────────────────────────────────────────────────────
   본문 문서
   ──────────────────────────────────────────────────────────── */

/**
 * 본문은 Tiptap JSON이다. 노드 종류까지 검증하지 않는다 — 확장을 하나 더할 때마다
 * 스키마를 따라 고쳐야 하고, 빠뜨리면 멀쩡한 편집이 저장되지 않는다.
 *
 * 대신 **모양과 크기만** 본다. 이것으로 막으려는 것은 두 가지다.
 *   · `docToPlainText`가 순회하다 스택을 넘기는 것
 *   · 에디터가 만들 수 없는 값이 jsonb에 들어가 공유 열람 화면에 렌더되는 것
 */
const MAX_DEPTH = 60;
const MAX_NODES = 20_000;

export class InvalidDocError extends Error {
  constructor(reason: string) {
    super(`본문을 저장할 수 없습니다: ${reason}`);
    this.name = "InvalidDocError";
  }
}

type DocNode = { type?: unknown; content?: unknown; text?: unknown };

/**
 * 문서를 그대로 돌려주되, 모양이 아니면 던진다.
 *
 * 되돌리기·이력 미리보기도 같은 값을 다루므로 여기 한 곳만 통과시키면 된다.
 */
export function assertNoteDoc(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new InvalidDocError("문서 형식이 아닙니다.");
  }

  let nodes = 0;

  const walk = (node: unknown, depth: number): void => {
    if (depth > MAX_DEPTH) throw new InvalidDocError("중첩이 너무 깊습니다.");
    if (++nodes > MAX_NODES) throw new InvalidDocError("문서가 너무 큽니다.");

    if (typeof node !== "object" || node === null || Array.isArray(node)) {
      throw new InvalidDocError("노드 형식이 아닙니다.");
    }

    const { type, content, text } = node as DocNode;
    if (typeof type !== "string" || type.length === 0 || type.length > 64) {
      throw new InvalidDocError("노드 종류가 올바르지 않습니다.");
    }
    if (text !== undefined && typeof text !== "string") {
      throw new InvalidDocError("텍스트 노드가 올바르지 않습니다.");
    }
    if (content === undefined) return;
    if (!Array.isArray(content)) throw new InvalidDocError("자식 노드가 배열이 아닙니다.");
    for (const child of content) walk(child, depth + 1);
  };

  walk(value, 0);
  return value;
}
