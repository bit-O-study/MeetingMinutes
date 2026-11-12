/**
 * 공동 편집 서버가 클라이언트 메시지를 믿기 전에 거치는 순수 함수들.
 *
 * room.ts는 소켓·DB·타이머가 엉켜 있어 테스트하기 어렵다. 판단 로직만 여기로 빼서
 * 두 Y.Doc·직접 만든 awareness 메시지로 검증한다(protocol-guard.test.mts).
 */
import * as decoding from "lib0/decoding";
import * as Y from "yjs";

/**
 * 메시지 하나의 상한. 붙여넣기 한 번에 이만큼 넘는 일은 없다.
 * 소켓 단에서는 ws의 maxPayload가 먼저 막고, 여기 값은 같은 숫자로 한 번 더 본다.
 */
export const MAX_MESSAGE_BYTES = 2 * 1024 * 1024;

/** 저장할 문서 상태의 상한. 이보다 크면 DB에 쓰지 않는다(정상 회의록은 수백 KB 이하). */
export const MAX_DOC_STATE_BYTES = 16 * 1024 * 1024;

/** 노트 하나에 남기는 자동 이력 수. 오래된 것부터 지운다. */
export const REVISION_KEEP = 300;

/**
 * DB에 저장된 상태와 이 인스턴스의 상태를 합친다.
 *
 * 서버리스에서는 같은 노트의 방이 인스턴스마다 따로 생긴다. 각자 자기 상태만
 * 덮어쓰면 늦게 쓴 쪽이 이기고 다른 인스턴스의 편집은 영구히 사라진다.
 * Yjs 업데이트는 합쳐도 결과가 같으므로(교환·멱등) 항상 합쳐서 쓴다.
 */
export function mergeDocStates(stored: Uint8Array | null | undefined, local: Uint8Array): Uint8Array {
  if (!stored || stored.length === 0) return local;
  return Y.mergeUpdates([stored, local]);
}

export type AwarenessEntry = {
  clientId: number;
  /** state.user.id. 상태가 없거나(null) user가 없으면 null */
  userId: string | null;
  /** 상태가 null — 클라이언트가 스스로 나간다는 뜻 */
  removed: boolean;
};

/**
 * awareness 업데이트를 적용하지 않고 읽기만 한다. 형식이 틀리면 던진다.
 *
 * y-protocols의 encodeAwarenessUpdate 형식:
 *   varUint(개수) · [varUint(clientID) · varUint(clock) · varString(JSON)]*
 */
export function readAwarenessEntries(update: Uint8Array): AwarenessEntry[] {
  const dec = decoding.createDecoder(update);
  const count = decoding.readVarUint(dec);
  if (count > 1000) throw new Error("awareness 항목이 너무 많습니다.");
  const entries: AwarenessEntry[] = [];
  for (let i = 0; i < count; i++) {
    const clientId = decoding.readVarUint(dec);
    decoding.readVarUint(dec); // clock
    const state = JSON.parse(decoding.readVarString(dec)) as unknown;
    const user = state && typeof state === "object" ? (state as { user?: { id?: unknown } }).user : undefined;
    entries.push({
      clientId,
      userId: user && typeof user.id === "string" ? user.id : null,
      removed: state === null,
    });
  }
  return entries;
}

/**
 * 이 연결이 보낸 awareness를 받아도 되는지.
 *
 *   · 다른 연결이 쥔 clientId의 상태를 바꾸거나 지우면 거절 — 남의 커서를 조작하거나 없앤다
 *   · 인증된 사용자와 다른 user.id를 내세우면 거절 — 커서 이름 위조, 이력 작성자 위조
 *
 * boundUserId가 null이면(인증 없는 로컬 개발 서버) 신원은 보지 않는다.
 */
export function awarenessUpdateAllowed(
  entries: AwarenessEntry[],
  opts: { boundUserId: string | null; liveClientIds: Iterable<number>; ownedClientIds: Set<number> },
): boolean {
  const live = new Set(opts.liveClientIds);
  for (const entry of entries) {
    if (live.has(entry.clientId) && !opts.ownedClientIds.has(entry.clientId)) return false;
    if (entry.removed || opts.boundUserId === null) continue;
    if (entry.userId !== null && entry.userId !== opts.boundUserId) return false;
  }
  return true;
}
