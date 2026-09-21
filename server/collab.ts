/**
 * 공동 편집 WebSocket 서버 (로컬 개발용)
 *
 *   npm run collab
 *
 * 노트 하나 = 방 하나. 방 이름은 noteId다.
 * Yjs 문서 상태를 note_docs.state에 주기적으로 스냅샷한다.
 *
 * ── 배포 시 ─────────────────────────────────────────────────
 * Vercel Functions는 WebSocket을 지원하므로 이 로직을
 * experimental_upgradeWebSocket 기반 라우트 핸들러로 옮긴다.
 * 프로토콜 처리부(handleMessage)는 그대로 재사용할 수 있다.
 */
import http from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import { eq } from "drizzle-orm";

import { db, sql } from "../src/lib/db";
import { noteDocs } from "../src/lib/db/schema";

const PORT = Number(process.env.COLLAB_PORT ?? 1234);
const SNAPSHOT_DEBOUNCE_MS = 3000;
/** 아무도 없는 방은 정리한다. 마지막 스냅샷은 저장한 뒤 비운다. */
const ROOM_IDLE_MS = 30_000;

const MSG_SYNC = 0;
const MSG_AWARENESS = 1;

type Room = {
  name: string;
  doc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  conns: Set<WebSocket>;
  saveTimer?: ReturnType<typeof setTimeout>;
  idleTimer?: ReturnType<typeof setTimeout>;
  loaded: Promise<void>;
};

const rooms = new Map<string, Room>();

function getRoom(name: string): Room {
  const existing = rooms.get(name);
  if (existing) {
    if (existing.idleTimer) clearTimeout(existing.idleTimer);
    return existing;
  }

  const doc = new Y.Doc();
  const awareness = new awarenessProtocol.Awareness(doc);
  awareness.setLocalState(null);

  const room: Room = {
    name,
    doc,
    awareness,
    conns: new Set(),
    loaded: loadState(name, doc),
  };

  doc.on("update", (update: Uint8Array, origin: unknown) => {
    broadcastUpdate(room, update, origin);
    scheduleSnapshot(room);
  });

  awareness.on(
    "update",
    (
      { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
      origin: unknown,
    ) => {
      const changed = added.concat(updated, removed);
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, MSG_AWARENESS);
      encoding.writeVarUint8Array(
        enc,
        awarenessProtocol.encodeAwarenessUpdate(awareness, changed),
      );
      const payload = encoding.toUint8Array(enc);
      room.conns.forEach((conn) => {
        if (conn !== origin) send(conn, payload);
      });
    },
  );

  rooms.set(name, room);
  return room;
}

async function loadState(noteId: string, doc: Y.Doc) {
  try {
    const [row] = await db
      .select({ state: noteDocs.state })
      .from(noteDocs)
      .where(eq(noteDocs.noteId, noteId))
      .limit(1);

    if (row?.state && row.state.length > 0) {
      Y.applyUpdate(doc, row.state, "db");
      log(`${short(noteId)} 상태 복원 ${row.state.length}B`);
    }
  } catch (err) {
    log(`${short(noteId)} 상태 복원 실패: ${(err as Error).message}`);
  }
}

function scheduleSnapshot(room: Room) {
  if (room.saveTimer) clearTimeout(room.saveTimer);
  room.saveTimer = setTimeout(() => void snapshot(room), SNAPSHOT_DEBOUNCE_MS);
}

async function snapshot(room: Room) {
  const state = Y.encodeStateAsUpdate(room.doc);
  try {
    await db
      .insert(noteDocs)
      .values({ noteId: room.name, state, snapshotAt: new Date() })
      .onConflictDoUpdate({
        target: noteDocs.noteId,
        set: { state, snapshotAt: new Date() },
      });
  } catch (err) {
    log(`${short(room.name)} 스냅샷 실패: ${(err as Error).message}`);
  }
}

function broadcastUpdate(room: Room, update: Uint8Array, origin: unknown) {
  const enc = encoding.createEncoder();
  encoding.writeVarUint(enc, MSG_SYNC);
  syncProtocol.writeUpdate(enc, update);
  const payload = encoding.toUint8Array(enc);
  room.conns.forEach((conn) => {
    if (conn !== origin) send(conn, payload);
  });
}

function send(conn: WebSocket, data: Uint8Array) {
  if (conn.readyState !== conn.OPEN) return;
  try {
    conn.send(data);
  } catch {
    conn.close();
  }
}

function handleMessage(room: Room, conn: WebSocket, data: Uint8Array) {
  const dec = decoding.createDecoder(data);
  const enc = encoding.createEncoder();
  const type = decoding.readVarUint(dec);

  if (type === MSG_SYNC) {
    encoding.writeVarUint(enc, MSG_SYNC);
    syncProtocol.readSyncMessage(dec, enc, room.doc, conn);
    if (encoding.length(enc) > 1) send(conn, encoding.toUint8Array(enc));
    return;
  }

  if (type === MSG_AWARENESS) {
    awarenessProtocol.applyAwarenessUpdate(
      room.awareness,
      decoding.readVarUint8Array(dec),
      conn,
    );
  }
}

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server });

wss.on("connection", async (conn: WebSocket, req) => {
  // y-websocket 클라이언트는 /<roomname> 으로 붙는다.
  const roomName = decodeURIComponent((req.url ?? "/").slice(1).split("?")[0]);
  if (!roomName) return conn.close();

  const room = getRoom(roomName);
  room.conns.add(conn);
  conn.binaryType = "arraybuffer";

  await room.loaded;

  conn.on("message", (data: ArrayBuffer | Buffer) =>
    handleMessage(room, conn, new Uint8Array(data as ArrayBuffer)),
  );

  conn.on("close", () => {
    room.conns.delete(conn);
    awarenessProtocol.removeAwarenessStates(room.awareness, [room.doc.clientID], null);

    if (room.conns.size === 0) {
      room.idleTimer = setTimeout(async () => {
        await snapshot(room);
        room.doc.destroy();
        rooms.delete(room.name);
        log(`${short(room.name)} 방 정리`);
      }, ROOM_IDLE_MS);
    }
  });

  // 1) 서버 상태를 알린다  2) 클라이언트 상태를 요청한다
  const syncEnc = encoding.createEncoder();
  encoding.writeVarUint(syncEnc, MSG_SYNC);
  syncProtocol.writeSyncStep1(syncEnc, room.doc);
  send(conn, encoding.toUint8Array(syncEnc));

  const states = room.awareness.getStates();
  if (states.size > 0) {
    const awEnc = encoding.createEncoder();
    encoding.writeVarUint(awEnc, MSG_AWARENESS);
    encoding.writeVarUint8Array(
      awEnc,
      awarenessProtocol.encodeAwarenessUpdate(room.awareness, [...states.keys()]),
    );
    send(conn, encoding.toUint8Array(awEnc));
  }

  log(`${short(roomName)} 접속 · 현재 ${room.conns.size}명`);
});

server.listen(PORT, () => {
  log(`공동 편집 서버 ws://localhost:${PORT}`);
});

async function shutdown() {
  log("스냅샷 저장 중…");
  await Promise.all([...rooms.values()].map(snapshot));
  await sql.end({ timeout: 5 });
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function short(id: string) {
  return id.slice(0, 8);
}

function log(msg: string) {
  process.stdout.write(`[collab] ${msg}\n`);
}
