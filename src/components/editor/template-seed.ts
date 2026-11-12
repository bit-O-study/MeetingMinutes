import * as Y from "yjs";
import { prosemirrorToYXmlFragment } from "y-prosemirror";
import type { Schema } from "@tiptap/pm/model";

/**
 * 빈 공동 편집 문서에 템플릿을 심는 Yjs 업데이트를 만든다.
 *
 * ── 왜 고정된 clientID로 만드나 ─────────────────────────────
 * 새 노트를 두 사람이 거의 동시에 처음 열면 둘 다 "문서가 비었다"고 보고 템플릿을
 * 심는다. 각자 다른 clientID로 심으면 Yjs는 서로 다른 삽입 두 개로 보고 둘 다 남겨,
 * 템플릿이 두 번 들어갔다.
 *
 * 노트 id에서 뽑은 같은 clientID로, 같은 내용을, 같은 순서로 만들면 두 클라이언트의
 * 업데이트가 **완전히 같은 항목**(clientID·clock 동일)이 된다. Yjs는 이미 가진 항목을
 * 다시 적용하지 않으므로 몇 명이 동시에 심어도 한 벌만 남는다.
 *
 * 부수 효과: 누군가 본문을 전부 지운 뒤 다시 열어도 템플릿이 되살아나지 않는다
 * (같은 항목은 이미 지워진 것으로 기록돼 있다). 지운 것은 지운 것으로 두는 편이 맞다.
 *
 * 근본 해결은 서버가 방을 처음 열 때 초기 상태를 만들어 두는 것이다(공동 편집 서버 담당).
 */
export function seedClientId(noteId: string): number {
  let hash = 2166136261;
  for (let i = 0; i < noteId.length; i++) {
    hash ^= noteId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  // Yjs clientID는 uint32. 0은 피한다(일부 도구가 "없음"으로 취급).
  return (hash >>> 0) || 1;
}

/** 에디터의 Collaboration 확장이 쓰는 조각 이름. Tiptap 기본값이 "default"다. */
export const COLLAB_FIELD = "default";

export function templateSeedUpdate(schema: Schema, content: unknown, noteId: string): Uint8Array {
  const seed = new Y.Doc();
  seed.clientID = seedClientId(noteId);
  // 노드는 에디터의 스키마로 만든다. y-prosemirror의 JSON 변환은 자기 쪽 prosemirror-model을
  // 써서, 번들·테스트 환경에 따라 다른 사본과 섞이면 instanceof 검사에서 깨진다.
  prosemirrorToYXmlFragment(schema.nodeFromJSON(content), seed.getXmlFragment(COLLAB_FIELD));
  const update = Y.encodeStateAsUpdate(seed);
  seed.destroy();
  return update;
}
