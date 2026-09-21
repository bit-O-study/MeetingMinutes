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
import { yXmlFragmentToProsemirrorJSON } from "y-prosemirror";
import { desc, eq } from "drizzle-orm";

import { db, sql } from "../src/lib/db";
import { noteDocs, noteRevisions } from "../src/lib/db/schema";
import { sectionsFromDoc, summarizeChange, type Section } from "../src/lib/revision-summary";

const PORT = Number(process.env.COLLAB_PORT ?? 1234);
const SNAPSHOT_DEBOUNCE_MS = 3000;
/** 아무도 없는 방은 정리한다. 마지막 스냅샷은 저장한 뒤 비운다. */
const ROOM_IDLE_MS = 30_000;
/**
 * 편집이 멎고 이만큼 지나면 이력에 한 줄 남긴다.
 * 글자마다 남기면 이력이 수천 줄이 되어 아무도 못 읽는다.
 */
const REVISION_SETTLE_MS = Number(process.env.REVISION_SETTLE_MS ?? 15_000);

const MSG_SYNC = 0;
const MSG_AWARENESS = 1;

type Room = {
  name: string;
  doc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  conns: Set<WebSocket>;
  saveTimer?: ReturnType<typeof setTimeout>;
  idleTimer?: ReturnType<typeof setTimeout>;
  revisionTimer?: ReturnType<typeof setTimeout>;
  loaded: Promise<void>;
  /** 마지막으로 이력에 남긴 시점의 구획. 이것과 비교해 요약을 만든다. */
  lastSections: Section[];
  /** 가장 최근에 문서를 바꾼 사람. 이력의 작성자가 된다. */
  pendingActor: string | null;
};

const rooms = new Map<string, Room>();
/** 연결 ↔ 사용자. awareness로 들어온 값을 기억해 두고 이력 작성자를 정한다. */
const connUser = new WeakMap<WebSocket, string>();

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
    lastSections: [],
    pendingActor: null,
  };

  room.loaded = room.loaded.then(() => {
    room.lastSections = sectionsFromDoc(docToJSON(doc));
  });

  doc.on("update", (update: Uint8Array, origin: unknown) => {
    broadcastUpdate(room, update, origin);
    scheduleSnapshot(room);

    // DB에서 복원한 변경은 사람이 한 편집이 아니다.
    if (origin === "db") return;
    const actor = connUser.get(origin as WebSocket);
    if (actor) room.pendingActor = actor;
    scheduleRevision(room);
  });

  awareness.on(
    "update",
    (
      { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
      origin: unknown,
    ) => {
      const changed = added.concat(updated, removed);

      // 이 연결이 누구인지 기억해 둔다. 문서 변경에는 사용자 정보가 실려 오지 않는다.
      if (origin && typeof origin === "object") {
        for (const clientId of added.concat(updated)) {
          const user = (awareness.getStates().get(clientId) as { user?: { id?: string } })?.user;
          if (user?.id) connUser.set(origin as WebSocket, user.id);
        }
      }

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

/** Tiptap의 Collaboration 확장이 쓰는 조각 이름은 "default"다. */
function docToJSON(doc: Y.Doc): unknown {
  try {
    return yXmlFragmentToProsemirrorJSON(doc.getXmlFragment("default"));
  } catch {
    return null;
  }
}

function scheduleRevision(room: Room) {
  if (room.revisionTimer) clearTimeout(room.revisionTimer);
  room.revisionTimer = setTimeout(() => void recordRevision(room), REVISION_SETTLE_MS);
}

/**
 * 이력에 남길 작성자를 정한다.
 *
 * 연결 객체에 사용자를 묶어 두지만, 클라이언트가 재연결하면 새 연결에는
 * 매핑이 없다. awareness는 이전 연결에 붙어 있었기 때문이다.
 * 그럴 때는 지금 방에 있는 사람이 한 명뿐이면 그 사람으로 본다.
 * 여럿이면 누구인지 단정할 수 없으므로 비워 둔다 — 틀린 이름을 적는 것보다 낫다.
 */
function resolveActor(room: Room): string | null {
  if (room.pendingActor) return room.pendingActor;

  const ids = new Set<string>();
  room.awareness.getStates().forEach((state) => {
    const user = (state as { user?: { id?: string } }).user;
    if (user?.id) ids.add(user.id);
  });

  return ids.size === 1 ? [...ids][0] : null;
}

/**
 * 편집이 멎으면 이력에 한 줄 남긴다.
 *
 * 바뀐 게 없으면 남기지 않는다. 커서만 움직여도 문서 업데이트가 오가는데
 * 그때마다 리비전이 생기면 목록이 의미 없어진다.
 */
async function recordRevision(room: Room) {
  const content = docToJSON(room.doc);
  if (!content) return;

  const sections = sectionsFromDoc(content);
  const summary = summarizeChange(room.lastSections, sections);
  if (!summary) return;

  try {
    /*
      DB의 마지막 이력과도 비교한다.
      서버를 다시 띄웠거나 되돌리기가 직접 이력을 남긴 직후라면
      room.lastSections이 뒤처져 있어서 같은 내용이 두 번 쌓인다.
    */
    const [latest] = await db
      .select({ content: noteRevisions.content })
      .from(noteRevisions)
      .where(eq(noteRevisions.noteId, room.name))
      .orderBy(desc(noteRevisions.createdAt))
      .limit(1);

    if (latest && summarizeChange(sectionsFromDoc(latest.content), sections) === null) {
      room.lastSections = sections;
      return;
    }

    await db.insert(noteRevisions).values({
      noteId: room.name,
      actorId: resolveActor(room),
      content: content as never,
      summary,
    });
    room.lastSections = sections;
    room.pendingActor = null;
    log(`${short(room.name)} 이력 기록 · ${summary}`);
  } catch (err) {
    log(`${short(room.name)} 이력 기록 실패: ${(err as Error).message}`);
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

wss.on("connection", (conn: WebSocket, req) => {
  // y-websocket 클라이언트는 /<roomname> 으로 붙는다.
  const roomName = decodeURIComponent((req.url ?? "/").slice(1).split("?")[0]);
  if (!roomName) return conn.close();

  const room = getRoom(roomName);
  room.conns.add(conn);
  conn.binaryType = "arraybuffer";

  /*
    메시지 수신부를 먼저 붙인다.

    방 상태를 DB에서 불러오는 동안(첫 접속자면 왕복 한 번) 클라이언트는
    이미 동기화 요청을 보낸다. 불러오기를 await한 뒤에 리스너를 붙이면
    그 사이 도착한 메시지가 사라져서 영영 동기화가 끝나지 않는다.
    그래서 준비될 때까지 버퍼에 담아 두고 나중에 순서대로 처리한다.
  */
  let ready = false;
  const pending: Uint8Array[] = [];

  conn.on("message", (data: ArrayBuffer | Buffer) => {
    const bytes = new Uint8Array(data as ArrayBuffer);
    if (ready) handleMessage(room, conn, bytes);
    else pending.push(bytes);
  });

  conn.on("close", () => {
    room.conns.delete(conn);
    awarenessProtocol.removeAwarenessStates(room.awareness, [room.doc.clientID], null);

    if (room.conns.size === 0) {
      room.idleTimer = setTimeout(async () => {
        // 마지막 사람이 나갈 때 남은 변경을 이력에 남긴다. 기다리다 놓치면 안 된다.
        if (room.revisionTimer) clearTimeout(room.revisionTimer);
        await recordRevision(room);
        await snapshot(room);
        room.doc.destroy();
        rooms.delete(room.name);
        log(`${short(room.name)} 방 정리`);
      }, ROOM_IDLE_MS);
    }
  });

  void room.loaded.then(() => {
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

    ready = true;
    for (const bytes of pending) handleMessage(room, conn, bytes);
    pending.length = 0;

    log(`${short(roomName)} 접속 · 현재 ${room.conns.size}명`);
  });
});

server.listen(PORT, () => {
  log(`공동 편집 서버 ws://localhost:${PORT}`);
});

async function shutdown() {
  log("스냅샷 저장 중…");
  await Promise.all([...rooms.values()].map(recordRevision));
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
