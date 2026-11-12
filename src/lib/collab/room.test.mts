import assert from "node:assert/strict";
import { test, after } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { EventEmitter } from "node:events";
import { runInNewContext } from "node:vm";
import ts from "typescript";

import * as actionInput from "../action-input.js";
import * as protocolGuard from "./protocol-guard.js";
import * as persistence from "./persistence.js";

const require = createRequire(import.meta.url);
// room.ts가 VM 안에서 require로 쓰는 것과 같은 Yjs 빌드를 쓴다.
const Y = require("yjs") as typeof import("yjs");
const encoding = require("lib0/encoding") as typeof import("lib0/encoding");
const syncProtocol = require("y-protocols/sync") as typeof import("y-protocols/sync");
const awarenessProtocol = require("y-protocols/awareness") as typeof import("y-protocols/awareness");
const testAwareness = new Set<import("y-protocols/awareness").Awareness>();
after(() => { for (const awareness of testAwareness) awareness.destroy(); });

const roomSource = ts.transpileModule(readFileSync(new URL("./room.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;

type RoomModule = {
  joinRoom: (id: string, socket: unknown, identity?: { userId: string; spaceId: string } | null) => Promise<void>;
  roomCount: () => number;
  flushRooms: () => Promise<void>;
};

/** room.ts를 새 모듈 인스턴스로 띄운다. 두 번 부르면 서버리스 인스턴스 둘과 같다. */
function loadRoom(db: unknown): RoomModule {
  const exports = {} as RoomModule;
  // 테스트가 끝난 뒤 이력·정리 타이머가 프로세스를 붙잡지 않게 한다.
  const unrefTimeout = (fn: () => void, ms: number) => {
    const t = setTimeout(fn, ms);
    t.unref();
    return t;
  };
  const unrefInterval = (fn: () => void, ms: number) => {
    const t = setInterval(fn, ms);
    t.unref();
    return t;
  };
  runInNewContext(roomSource, {
    exports, Buffer, Uint8Array, setTimeout: unrefTimeout, clearTimeout, setInterval: unrefInterval, clearInterval,
    process: { env: {}, stdout: { write() {} } },
    require: (id: string) => {
      if (id === "y-protocols/awareness") return { ...awarenessProtocol, Awareness: class extends awarenessProtocol.Awareness {
        constructor(doc: import("yjs").Doc) { super(doc); testAwareness.add(this); }
      } };
      if (id === "@/lib/templates") return { docToPlainText: () => "" };
      if (id === "@/lib/db") return { db };
      if (id === "@/lib/db/schema") return { noteDocs: {}, noteRevisions: {}, notes: {}, spaceMembers: {} };
      if (id === "@/lib/action-input") return actionInput;
      if (id === "@/lib/collab/protocol-guard") return protocolGuard;
      if (id === "@/lib/collab/persistence") return persistence;
      if (id === "@/lib/revision-summary") return { sectionsFromDoc: () => [], summarizeChange: () => null };
      return require(id);
    },
  });
  return exports;
}

class Socket extends EventEmitter {
  OPEN = 1; readyState = 1; sent: Uint8Array[] = []; code = 0;
  binaryType = "";
  send(data: Uint8Array) { this.sent.push(data); }
  close(code: number) { this.code = code; this.readyState = 3; this.emit("close"); }
}

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

test("저장 ACK는 구독한 연결에 DB 커밋 이후에만 전달한다", async () => {
  const { db } = fakeDocStore(null);
  let fail = true;
  const original = db.transaction;
  db.transaction = (fn) => fail ? Promise.reject(new Error("DB unavailable")) : original(fn);
  const room = loadRoom(db);
  const newer = new Socket(), older = new Socket();
  void room.joinRoom("ack-note", newer); void room.joinRoom("ack-note", older);
  await tick(10);
  newer.emit("message", new Uint8Array([persistence.MSG_PERSISTED]));
  const doc = new Y.Doc(); doc.getText("t").insert(0, "저장 확인");
  newer.emit("message", syncUpdateMessage(Y.encodeStateAsUpdate(doc)));
  await room.flushRooms();
  assert.equal(newer.sent.filter((msg) => msg[0] === persistence.MSG_PERSISTED).length, 0);
  fail = false;
  await room.flushRooms();
  assert.equal(newer.sent.filter((msg) => msg[0] === persistence.MSG_PERSISTED).length, 1);
  assert.equal(older.sent.filter((msg) => msg[0] === persistence.MSG_PERSISTED).length, 0);
  newer.close(1000); older.close(1000); doc.destroy();
});

test("일시 DB 장애 후 새 편집 없이 자동 재시도하여 저장한다", async () => {
  const { db, store } = fakeDocStore(null);
  const original = db.transaction;
  let failures = 1;
  db.transaction = (fn) => failures-- > 0 ? Promise.reject(new Error("temporary")) : original(fn);
  const room = loadRoom(db), socket = new Socket(), doc = new Y.Doc();
  void room.joinRoom("retry-note", socket); await tick(10);
  socket.emit("message", new Uint8Array([persistence.MSG_PERSISTED]));
  doc.getText("t").insert(0, "자동 복구");
  socket.emit("message", syncUpdateMessage(Y.encodeStateAsUpdate(doc)));
  await room.flushRooms();
  assert.equal(store.writes, 0);
  await tick(1200);
  assert.equal(store.writes, 1);
  assert.equal(socket.sent.filter((msg) => msg[0] === persistence.MSG_PERSISTED).length, 1);
  socket.close(1000); doc.destroy();
});

function syncUpdateMessage(update: Uint8Array): Uint8Array {
  const enc = encoding.createEncoder();
  encoding.writeVarUint(enc, 0);
  syncProtocol.writeUpdate(enc, update);
  return encoding.toUint8Array(enc);
}

/**
 * note_docs 한 행을 흉내 내는 DB. snapshot이 쓰는 모양(트랜잭션 + FOR UPDATE)만 지원한다.
 * 트랜잭션은 순서대로 하나씩 돈다 — 행 잠금과 같은 효과.
 */
function fakeDocStore(initial: Uint8Array | null) {
  const store = { state: initial, writes: 0, notesUpdates: 0 };
  let queue = Promise.resolve();
  const tx = {
    insert: () => ({ values: () => ({ onConflictDoNothing: async () => {} }) }),
    select: () => ({ from: () => ({ where: () => ({ for: async () => [{ state: store.state }] }) }) }),
    update: (table: unknown) => ({
      set: (values: { state?: Uint8Array }) => ({
        where: async () => {
          if (values.state) { store.state = values.state; store.writes++; } else store.notesUpdates++;
          void table;
        },
      }),
    }),
  };
  const db = {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ state: store.state }] }) }) }),
    insert: () => { throw new Error("이력은 이 테스트에서 쓰지 않는다"); },
    transaction: (fn: (t: typeof tx) => Promise<void>) => {
      const run = queue.then(() => fn(tx));
      queue = run.catch(() => {});
      return run;
    },
  };
  return { store, db };
}

test("DB 복원 실패 시 빈 문서를 보내거나 저장하지 않고 다음 연결에서 재시도한다", async () => {
  let reads = 0, writes = 0;
  const db = {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => { reads++; throw new Error("test unavailable"); } }) }) }),
    insert: () => { writes++; throw new Error("must not write"); },
    transaction: () => { writes++; throw new Error("must not write"); },
  };
  const room = loadRoom(db);
  for (let attempt = 0; attempt < 2; attempt++) {
    const socket = new Socket();
    const closed = room.joinRoom("test-note", socket);
    socket.emit("message", new Uint8Array([0, 0]));
    await closed;
    assert.equal(socket.code, 1013);
    assert.equal(socket.sent.length, 0);
    assert.equal(room.roomCount(), 0);
  }
  await room.flushRooms();
  assert.equal(reads, 2);
  assert.equal(writes, 0);
});

test("두 인스턴스가 같은 노트를 저장해도 서로의 편집을 덮어쓰지 않는다", async () => {
  const base = new Y.Doc();
  base.getText("t").insert(0, "base ");
  const { store, db } = fakeDocStore(Y.encodeStateAsUpdate(base));

  // 서버리스 인스턴스 둘. 둘 다 같은 DB 상태에서 방을 연다.
  const instanceA = loadRoom(db);
  const instanceB = loadRoom(db);
  const socketA = new Socket();
  const socketB = new Socket();
  void instanceA.joinRoom("note-1", socketA);
  void instanceB.joinRoom("note-1", socketB);
  await tick(10);

  // 각 클라이언트가 자기 인스턴스에 서로 다른 편집을 보낸다.
  const clientA = new Y.Doc();
  Y.applyUpdate(clientA, store.state!);
  clientA.getText("t").insert(5, "A");
  const clientB = new Y.Doc();
  Y.applyUpdate(clientB, store.state!);
  clientB.getText("t").insert(5, "B");
  socketA.emit("message", syncUpdateMessage(Y.encodeStateAsUpdate(clientA)));
  socketB.emit("message", syncUpdateMessage(Y.encodeStateAsUpdate(clientB)));

  await instanceA.flushRooms();
  await instanceB.flushRooms();

  const saved = new Y.Doc();
  Y.applyUpdate(saved, store.state!);
  const text = saved.getText("t").toString();
  assert.ok(text.includes("A") && text.includes("B"), `둘 다 남아야 한다: ${text}`);
  assert.equal(store.writes, 2);

  // 나중에 저장한 인스턴스는 먼저 저장된 편집을 자기 클라이언트에게도 전파한다.
  const toB = new Y.Doc();
  Y.applyUpdate(toB, Y.encodeStateAsUpdate(clientB));
  for (const message of socketB.sent) {
    const dec = (require("lib0/decoding") as typeof import("lib0/decoding")).createDecoder(message);
    if ((require("lib0/decoding") as typeof import("lib0/decoding")).readVarUint(dec) !== 0) continue;
    syncProtocol.readSyncMessage(dec, encoding.createEncoder(), toB, null);
  }
  assert.ok(toB.getText("t").toString().includes("A"));
});

test("보기만 한 방은 저장하지 않는다(수정 시각이 바뀌지 않음)", async () => {
  const base = new Y.Doc();
  base.getText("t").insert(0, "hello");
  const { store, db } = fakeDocStore(Y.encodeStateAsUpdate(base));
  const room = loadRoom(db);
  const socket = new Socket();
  void room.joinRoom("note-2", socket);
  await tick(10);
  // 이미 가진 내용과 같은 상태를 보내도 문서는 바뀌지 않는다.
  socket.emit("message", syncUpdateMessage(Y.encodeStateAsUpdate(base)));
  await room.flushRooms();
  assert.equal(store.writes, 0);
  assert.equal(store.notesUpdates, 0);
});

test("잘못된 프레임은 그 연결만 닫고 프로세스를 죽이지 않는다", async () => {
  const { db } = fakeDocStore(null);
  const room = loadRoom(db);
  const bad = new Socket();
  const good = new Socket();
  void room.joinRoom("note-3", bad);
  void room.joinRoom("note-3", good);
  await tick(10);
  // awareness 길이만 크고 내용이 없는 프레임(sync 쪽 오류는 y-protocols가 스스로 삼킨다)
  bad.emit("message", new Uint8Array([1, 0xff, 0xff, 0xff, 0x0f]));
  assert.equal(bad.code, 1007);
  assert.equal(good.code, 0);
  // 상한을 넘는 메시지
  const big = new Socket();
  void room.joinRoom("note-3", big);
  await tick(10);
  big.emit("message", new Uint8Array(protocolGuard.MAX_MESSAGE_BYTES + 1));
  assert.equal(big.code, 1009);
});

test("인증된 사용자와 다른 user.id를 내세운 awareness는 받지 않는다", async () => {
  const { db } = fakeDocStore(null);
  const room = loadRoom(db);
  const attacker = new Socket();
  const victim = new Socket();
  void room.joinRoom("note-4", attacker, { userId: "attacker", spaceId: "space" });
  void room.joinRoom("note-4", victim, { userId: "victim", spaceId: "space" });
  await tick(10);

  const awarenessMessage = (userId: string) => {
    const doc = new Y.Doc();
    const awareness = new awarenessProtocol.Awareness(doc);
    awareness.setLocalStateField("user", { id: userId, name: userId });
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, 1);
    encoding.writeVarUint8Array(enc, awarenessProtocol.encodeAwarenessUpdate(awareness, [doc.clientID]));
    const bytes = encoding.toUint8Array(enc);
    awareness.destroy(); doc.destroy();
    return bytes;
  };

  const before = victim.sent.length;
  attacker.emit("message", awarenessMessage("victim"));
  assert.equal(victim.sent.length, before, "위조한 커서는 다른 사람에게 전파되지 않는다");
  attacker.emit("message", awarenessMessage("attacker"));
  assert.equal(victim.sent.length, before + 1, "자기 신원의 커서는 전파된다");
});
