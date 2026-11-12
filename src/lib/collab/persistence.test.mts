import assert from "node:assert/strict";
import { test } from "node:test";
import * as Y from "yjs";
import { matchesPersistenceProof, persistenceProof } from "./persistence.js";

test("저장 확인은 삽입뿐 아니라 삭제만 일어난 변경도 구분한다", () => {
  const doc = new Y.Doc();
  doc.getText("text").insert(0, "ABC");
  const proof = persistenceProof(doc);
  assert.equal(matchesPersistenceProof(doc, proof), true);
  const vector = Y.encodeStateVector(doc);
  doc.getText("text").delete(0, 1);
  assert.deepEqual(Y.encodeStateVector(doc), vector);
  assert.equal(matchesPersistenceProof(doc, proof), false);
  doc.destroy();
});

test("동일한 문서를 독립 복원해도 저장 증거는 일치한다", () => {
  const a = new Y.Doc(), b = new Y.Doc();
  a.getText("text").insert(0, "ABC"); a.getText("text").delete(1, 1);
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  assert.equal(matchesPersistenceProof(b, persistenceProof(a)), true);
  b.getText("text").insert(0, "추가");
  assert.equal(matchesPersistenceProof(b, persistenceProof(a)), false);
  a.destroy(); b.destroy();
});
