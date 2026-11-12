import * as Y from "yjs";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";

export const MSG_PERSISTED = 4;

// state vector만 비교하면 삭제만 한 변경을 놓친다. 삭제 집합까지 비교한다.
export function persistenceProof(doc: Y.Doc): Uint8Array {
  const vector = Y.encodeStateVector(doc);
  const enc = encoding.createEncoder();
  encoding.writeVarUint8Array(enc, vector);
  encoding.writeVarUint8Array(enc, Y.encodeStateAsUpdate(doc, vector));
  return encoding.toUint8Array(enc);
}

export function matchesPersistenceProof(doc: Y.Doc, proof: Uint8Array): boolean {
  const current = persistenceProof(doc);
  return current.length === proof.length && current.every((byte, i) => byte === proof[i]);
}

export function persistedMessage(doc: Y.Doc, at: number): Uint8Array {
  const enc = encoding.createEncoder();
  encoding.writeVarUint(enc, MSG_PERSISTED);
  encoding.writeVarUint(enc, at);
  encoding.writeVarUint8Array(enc, persistenceProof(doc));
  return encoding.toUint8Array(enc);
}

export function readPersistence(dec: decoding.Decoder) {
  return { at: decoding.readVarUint(dec), proof: decoding.readVarUint8Array(dec) };
}
