import assert from "node:assert/strict";
import { test } from "node:test";

import * as awarenessProtocol from "y-protocols/awareness";
import * as Y from "yjs";

import { awarenessUpdateAllowed, mergeDocStates, readAwarenessEntries } from "./protocol-guard.js";

test("DB 상태와 합치면 두 인스턴스의 편집이 모두 남는다", () => {
  const base = new Y.Doc();
  base.getText("t").insert(0, "회의록 ");
  const stored0 = Y.encodeStateAsUpdate(base);

  // 같은 저장 상태에서 출발한 두 인스턴스
  const a = new Y.Doc();
  Y.applyUpdate(a, stored0);
  a.getText("t").insert(4, "A");
  const b = new Y.Doc();
  Y.applyUpdate(b, stored0);
  b.getText("t").insert(4, "B");

  // A가 먼저 저장, B가 나중에 저장
  const afterA = mergeDocStates(stored0, Y.encodeStateAsUpdate(a));
  const afterB = mergeDocStates(afterA, Y.encodeStateAsUpdate(b));

  const result = new Y.Doc();
  Y.applyUpdate(result, afterB);
  const text = result.getText("t").toString();
  assert.ok(text.includes("A") && text.includes("B"), text);

  // 예전 방식(덮어쓰기)이라면 A의 편집이 사라졌다
  const overwritten = new Y.Doc();
  Y.applyUpdate(overwritten, Y.encodeStateAsUpdate(b));
  assert.ok(!overwritten.getText("t").toString().includes("A"));
});

test("저장된 상태가 없으면 이 인스턴스 상태를 그대로 쓴다", () => {
  const local = new Uint8Array([1, 2, 3]);
  assert.equal(mergeDocStates(null, local), local);
  assert.equal(mergeDocStates(new Uint8Array(), local), local);
});

function awarenessUpdate(userId: string | null, clientId?: number) {
  const doc = new Y.Doc();
  if (clientId !== undefined) doc.clientID = clientId;
  const awareness = new awarenessProtocol.Awareness(doc);
  if (userId) awareness.setLocalStateField("user", { id: userId, name: "x" });
  else awareness.setLocalState(null);
  const result = { update: awarenessProtocol.encodeAwarenessUpdate(awareness, [doc.clientID]), clientId: doc.clientID };
  awareness.destroy(); doc.destroy();
  return result;
}

test("awareness 메시지를 적용 전에 읽는다", () => {
  const { update, clientId } = awarenessUpdate("user-1");
  assert.deepEqual(readAwarenessEntries(update), [{ clientId, userId: "user-1", removed: false }]);
  const removed = awarenessUpdate(null);
  assert.equal(readAwarenessEntries(removed.update)[0].removed, true);
  assert.throws(() => readAwarenessEntries(new Uint8Array([1, 5])));
});

test("다른 사용자 행세나 남의 clientId 조작은 거절한다", () => {
  const mine = awarenessUpdate("me", 100);
  const entries = readAwarenessEntries(mine.update);
  const opts = { boundUserId: "me", liveClientIds: [] as number[], ownedClientIds: new Set<number>() };
  assert.equal(awarenessUpdateAllowed(entries, opts), true);

  // user.id 위조
  assert.equal(awarenessUpdateAllowed(readAwarenessEntries(awarenessUpdate("someone-else", 100).update), opts), false);

  // 다른 연결이 쥔 clientId(남의 커서)를 덮어쓰기
  assert.equal(awarenessUpdateAllowed(entries, { ...opts, liveClientIds: [100] }), false);
  // 자기 clientId 갱신은 허용
  assert.equal(awarenessUpdateAllowed(entries, { ...opts, liveClientIds: [100], ownedClientIds: new Set([100]) }), true);

  // 인증 없는 개발 서버는 신원을 보지 않는다
  assert.equal(awarenessUpdateAllowed(readAwarenessEntries(awarenessUpdate("anyone", 100).update), { ...opts, boundUserId: null }), true);
});
