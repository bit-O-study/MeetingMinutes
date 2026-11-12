/**
 * 공동 편집 방(room)과 Yjs 프로토콜 처리.
 *
 * 노트 하나 = 방 하나. 방 이름은 noteId다.
 *
 * 이 파일에는 전송 수단이 없다. 이미 붙은 소켓 하나를 받아
 * 동기화·awareness·스냅샷·이력만 처리한다. 그래서 두 곳에서 똑같이 쓴다.
 *
 *   개발 — server/collab.ts              ws 패키지로 :1234에 직접 띄운다
 *   배포 — app/api/collab/[noteId]       experimental_upgradeWebSocket이 넘겨 주는 소켓
 *
 * 두 경로 모두 `ws`의 WebSocket을 준다(Vercel의 업그레이드도 내부적으로 ws를 쓴다).
 * 그래서 소켓 타입을 따로 추상화하지 않았다 — 한 겹 줄이는 편이 읽기 쉽다.
 *
 * ── 서버리스에서의 한계 ─────────────────────────────────────
 * 아래 `rooms`는 인스턴스 메모리다. 같은 노트를 보는 두 사람이 서로 다른
 * 인스턴스에 붙으면 실시간 전파가 끊기고 DB 스냅샷 기준으로만 합쳐진다.
 * 스냅샷은 DB 상태와 **합쳐서** 쓰므로(snapshot 참고) 편집이 사라지지는 않는다.
 * 규모가 커지면 방 상태를 Redis 같은 외부 pub/sub으로 옮겨야 한다.
 */
import * as awarenessProtocol from "y-protocols/awareness";
import * as syncProtocol from "y-protocols/sync";
import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { WebSocket } from "ws";
import * as Y from "yjs";
import { yXmlFragmentToProsemirrorJSON } from "y-prosemirror";

import { assertNoteDoc } from "@/lib/action-input";
import { MSG_PERSISTED, persistedMessage } from "@/lib/collab/persistence";
import {
  MAX_DOC_STATE_BYTES,
  MAX_MESSAGE_BYTES,
  REVISION_KEEP,
  awarenessUpdateAllowed,
  mergeDocStates,
  readAwarenessEntries,
} from "@/lib/collab/protocol-guard";
import { db } from "@/lib/db";
import { docToPlainText } from "@/lib/templates";
import { noteDocs, noteRevisions, notes, spaceMembers } from "@/lib/db/schema";
import { sectionsFromDoc, summarizeChange, type Section } from "@/lib/revision-summary";

const SNAPSHOT_DEBOUNCE_MS = 3000;
/** 아무도 없는 방은 정리한다. 마지막 스냅샷은 저장한 뒤 비운다. */
const ROOM_IDLE_MS = 30_000;
/**
 * 편집이 멎고 이만큼 지나면 이력에 한 줄 남긴다.
 * 글자마다 남기면 이력이 수천 줄이 되어 아무도 못 읽는다.
 */
const REVISION_SETTLE_MS = Number(process.env.REVISION_SETTLE_MS ?? 15_000);
/**
 * 접속 중인 사람이 아직 스페이스 멤버인지 다시 확인하는 간격.
 * 제외는 서버 액션(대개 다른 함수 인스턴스)에서 일어나 이 프로세스 메모리로는 알 수 없다.
 * 그래서 방마다 주기적으로 DB를 본다. 방 하나에 쿼리 하나라 부담이 작다.
 */
const MEMBERSHIP_CHECK_MS = Number(process.env.COLLAB_MEMBERSHIP_CHECK_MS ?? 30_000);
/** 멤버가 아니게 된 사람의 연결을 닫을 때 쓰는 코드. 클라이언트는 이 코드면 재연결하지 않는다. */
export const CLOSE_FORBIDDEN = 4403;

const MSG_SYNC = 0;
const MSG_AWARENESS = 1;

type Room = {
  name: string;
  /** 멤버십 재확인에 쓴다. 인증 없는 개발 서버에서는 null */
  spaceId: string | null;
  doc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  /**
   * 연결 → 그 연결이 쥔 awareness clientId들.
   * 나갈 때 이 id만 지워야 남의 커서가 사라지지 않는다.
   */
  conns: Map<WebSocket, Set<number>>;
  saveTimer?: ReturnType<typeof setTimeout>;
  idleTimer?: ReturnType<typeof setTimeout>;
  revisionTimer?: ReturnType<typeof setTimeout>;
  memberTimer?: ReturnType<typeof setInterval>;
  loaded: Promise<void>;
  loadedOk: boolean;
  loadFailed: boolean;
  /** 마지막으로 이력에 남긴 시점의 구획. 이것과 비교해 요약을 만든다. */
  lastSections: Section[];
  /** 가장 최근에 문서를 바꾼 사람. 이력의 작성자가 된다. */
  pendingActor: string | null;
  /**
   * 마지막 스냅샷 이후 사람이 문서를 바꿨는지.
   * 보기만 한 방까지 저장하면 notes.updated_at이 갱신돼 "방금 수정"으로 보인다.
   */
  dirty: boolean;
  persisted: Uint8Array | null;
  ackConns: Set<WebSocket>;
  saveFailures: number;
};

const rooms = new Map<string, Room>();
/**
 * 정리(마지막 이력·스냅샷 저장) 중인 방. 같은 이름으로 새 방이 생기면
 * 이 저장이 끝난 뒤에 DB를 읽어야 방금 나간 사람의 편집을 놓치지 않는다.
 */
const closingRooms = new Map<string, Promise<void>>();
/**
 * 연결 ↔ 인증된 사용자. 업그레이드 라우트가 세션으로 확인한 값만 넣는다.
 * awareness의 user.id는 클라이언트가 마음대로 적을 수 있어 믿지 않는다.
 */
const connUser = new WeakMap<WebSocket, string>();
/** 인증된 연결은 클라이언트의 커서 정보로 작성자가 바뀌지 않는다. */
const authenticatedConns = new WeakSet<WebSocket>();

/** 헬스 체크용. 지금 이 인스턴스가 들고 있는 방 수. */
export function roomCount(): number {
  return rooms.size;
}

function getRoom(name: string, spaceId: string | null): Room {
  const existing = rooms.get(name);
  if (existing) {
    if (existing.idleTimer) clearTimeout(existing.idleTimer);
    existing.idleTimer = undefined;
    existing.spaceId ??= spaceId;
    return existing;
  }

  const doc = new Y.Doc();
  const awareness = new awarenessProtocol.Awareness(doc);
  awareness.setLocalState(null);

  const room: Room = {
    name,
    spaceId,
    doc,
    awareness,
    conns: new Map(),
    // 정리 중인 같은 방이 있으면 그 저장이 끝난 뒤에 읽는다.
    loaded: (closingRooms.get(name) ?? Promise.resolve()).then(async () => {
      const at = await loadState(name, doc);
      if (at) room.persisted = persistedMessage(doc, at);
    }),
    loadedOk: false,
    loadFailed: false,
    lastSections: [],
    pendingActor: null,
    dirty: false,
    persisted: null,
    ackConns: new Set(),
    saveFailures: 0,
  };

  room.loaded = room.loaded.then(() => {
    room.lastSections = sectionsFromDoc(docToJSON(doc));
    room.loadedOk = true;
  }).catch(() => {
    // 복원 실패한 방은 다시 쓰지 않고 다음 접속에서 재시도한다.
    room.loadFailed = true;
    if (rooms.get(name) === room) rooms.delete(name);
  });

  doc.on("update", (update: Uint8Array, origin: unknown) => {
    if (!room.loadedOk) return;
    // 스냅샷 때 DB에서 합쳐 온 다른 인스턴스의 편집. 전파만 하고 저장·이력은 건드리지 않는다.
    if (origin === "db") {
      broadcastUpdate(room, update, null);
      return;
    }
    room.dirty = true;
    broadcastUpdate(room, update, origin);
    scheduleSnapshot(room);

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

      // 이 연결이 쥔 clientId를 적어 둔다. 끊길 때 이것만 지운다.
      const owned = origin ? room.conns.get(origin as WebSocket) : undefined;
      if (owned) {
        for (const clientId of added) owned.add(clientId);
        for (const clientId of removed) owned.delete(clientId);
      }

      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, MSG_AWARENESS);
      encoding.writeVarUint8Array(
        enc,
        awarenessProtocol.encodeAwarenessUpdate(awareness, changed),
      );
      const payload = encoding.toUint8Array(enc);
      room.conns.forEach((_owned, conn) => {
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
      .select({ state: noteDocs.state, snapshotAt: noteDocs.snapshotAt })
      .from(noteDocs)
      .where(eq(noteDocs.noteId, noteId))
      .limit(1);

    if (row?.state && row.state.length > 0) {
      Y.applyUpdate(doc, row.state, "db");
      log(`${short(noteId)} 상태 복원 ${row.state.length}B`);
    }
    return row?.snapshotAt?.getTime() ?? null;
  } catch (err) {
    log(`${short(noteId)} 상태 복원 실패: ${(err as Error).message}`);
    throw err;
  }
}

function scheduleSnapshot(room: Room) {
  room.saveFailures = 0;
  if (room.saveTimer) clearTimeout(room.saveTimer);
  room.saveTimer = setTimeout(() => void snapshot(room), SNAPSHOT_DEBOUNCE_MS);
}

/**
 * 방 상태를 DB에 저장한다.
 *
 * **덮어쓰지 않고 합친다.** 같은 노트의 방이 다른 인스턴스에도 떠 있을 수 있다
 * (서버리스, 300초마다 재접속). 행을 잠그고(FOR UPDATE) 저장된 상태와 합쳐 쓰므로
 * 어느 쪽이 늦게 써도 상대의 편집이 남는다. 합쳐 온 상대 편집은 이 방에도 반영해
 * 지금 붙어 있는 사람들에게 전파한다.
 *
 * 바뀐 게 없으면(dirty=false) 아무것도 쓰지 않는다 — 보기만 해도 수정 시각이 바뀌던 문제.
 */
async function snapshot(room: Room) {
  if (!room.loadedOk || !room.dirty) return;
  room.dirty = false;
  let saved: Uint8Array | null = null;
  try {
    await db.transaction(async (tx) => {
      // 행이 없으면 잠글 대상이 없어 두 인스턴스가 동시에 INSERT 할 수 있다. 먼저 만들어 둔다.
      await tx.insert(noteDocs).values({ noteId: room.name }).onConflictDoNothing();
      const [row] = await tx
        .select({ state: noteDocs.state })
        .from(noteDocs)
        .where(eq(noteDocs.noteId, room.name))
        .for("update");

      if (row?.state && row.state.length > 0) Y.applyUpdate(room.doc, row.state, "db");
      const state = mergeDocStates(row?.state, Y.encodeStateAsUpdate(room.doc));
      if (state.length > MAX_DOC_STATE_BYTES) {
        log(`${short(room.name)} 스냅샷 거절: 문서 상태 ${state.length}B가 상한을 넘음`);
        throw new Error("문서 상태 크기 제한 초과");
      }
      await tx.update(noteDocs).set({ state, snapshotAt: new Date() }).where(eq(noteDocs.noteId, room.name));
      // 비동기 DB 처리 중 다음 편집이 들어올 수 있어 실제 저장한 state로 증거를 만든다.
      const persistedDoc = new Y.Doc();
      try {
        Y.applyUpdate(persistedDoc, state);
        saved = persistedMessage(persistedDoc, Date.now());
      } finally { persistedDoc.destroy(); }

      // 창을 바로 닫아 클라이언트 디바운스가 취소돼도 검색·공유 사본은 복구한다.
      // 저장 액션과 같은 검사(assertNoteDoc)를 거친다 — 공동 편집 경로로 우회하지 못하게.
      if (room.doc.getXmlFragment("default").length === 0) return;
      const content = docToJSON(room.doc);
      if (!content) return;
      try {
        assertNoteDoc(content);
      } catch (err) {
        log(`${short(room.name)} 렌더 사본 저장 생략: ${(err as Error).message}`);
        return;
      }
      await tx
        .update(notes)
        .set({ content: content as never, plainText: docToPlainText(content), updatedAt: new Date() })
        .where(eq(notes.id, room.name));
    });
    // 트랜잭션이 커밋된 뒤에만 확인 응답한다. 구버전 클라이언트에는 보내지 않는다.
    if (saved) {
      room.persisted = saved;
      room.ackConns.forEach((conn) => send(conn, saved!));
    }
    room.saveFailures = 0;
  } catch (err) {
    // 타이핑을 멈췄어도 일시 장애에서 회복한다. 한 번의 편집당 재시도 횟수는 제한한다.
    room.dirty = true;
    room.saveFailures += 1;
    if (room.saveFailures <= 5 && rooms.get(room.name) === room) {
      if (room.saveTimer) clearTimeout(room.saveTimer);
      room.saveTimer = setTimeout(() => void snapshot(room), 1000 * 2 ** (room.saveFailures - 1));
    }
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
 * 연결 객체에 인증된 사용자를 묶어 두므로 바꾼 연결을 알면 그 사람이다.
 * 모르면 지금 방에 있는 사람이 한 명뿐일 때만 그 사람으로 본다.
 * 여럿이면 누구인지 단정할 수 없으므로 비워 둔다 — 틀린 이름을 적는 것보다 낫다.
 * awareness의 user.id는 클라이언트가 적은 값이라 쓰지 않는다.
 */
function resolveActor(room: Room): string | null {
  if (room.pendingActor) return room.pendingActor;

  const ids = new Set<string>();
  room.conns.forEach((_owned, conn) => {
    const id = connUser.get(conn);
    if (id) ids.add(id);
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
  if (!room.loadedOk) return;
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

    // 이력 사본도 본문과 같은 검사를 거친다. 이력 미리보기·되돌리기가 그대로 렌더한다.
    assertNoteDoc(content);

    await db.insert(noteRevisions).values({
      noteId: room.name,
      actorId: resolveActor(room),
      content: content as never,
      summary,
    });
    room.lastSections = sections;
    room.pendingActor = null;
    log(`${short(room.name)} 이력 기록 · ${summary}`);

    // 자동 이력은 편집이 이어지는 한 끝없이 쌓인다. 최근 것만 남긴다.
    await db.execute(sql`
      delete from ${noteRevisions}
      where ${noteRevisions.noteId} = ${room.name}
        and ${noteRevisions.id} in (
          select ${noteRevisions.id} from ${noteRevisions}
          where ${noteRevisions.noteId} = ${room.name}
          order by ${noteRevisions.createdAt} desc
          offset ${REVISION_KEEP}
        )`);
  } catch (err) {
    log(`${short(room.name)} 이력 기록 실패: ${(err as Error).message}`);
  }
}

function broadcastUpdate(room: Room, update: Uint8Array, origin: unknown) {
  const enc = encoding.createEncoder();
  encoding.writeVarUint(enc, MSG_SYNC);
  syncProtocol.writeUpdate(enc, update);
  const payload = encoding.toUint8Array(enc);
  room.conns.forEach((_owned, conn) => {
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

  if (type === MSG_PERSISTED) {
    room.ackConns.add(conn);
    if (room.persisted) send(conn, room.persisted);
    return;
  }

  if (type === MSG_SYNC) {
    encoding.writeVarUint(enc, MSG_SYNC);
    syncProtocol.readSyncMessage(dec, enc, room.doc, conn);
    if (encoding.length(enc) > 1) send(conn, encoding.toUint8Array(enc));
    return;
  }

  if (type === MSG_AWARENESS) {
    const update = decoding.readVarUint8Array(dec);
    const allowed = awarenessUpdateAllowed(readAwarenessEntries(update), {
      boundUserId: connUser.get(conn) ?? null,
      liveClientIds: room.awareness.getStates().keys(),
      ownedClientIds: room.conns.get(conn) ?? new Set(),
    });
    // 남의 커서를 건드리거나 다른 사람 행세를 하는 메시지는 버린다.
    // 연결까지 끊으면 재접속 직후 경합에서 정상 클라이언트가 끊길 수 있다.
    if (!allowed) return;
    awarenessProtocol.applyAwarenessUpdate(room.awareness, update, conn);
  }
}

/**
 * 메시지 하나를 처리한다. 무엇이 와도 프로세스를 죽이지 않는다.
 *
 * 형식이 틀린 프레임은 lib0 디코더가 던진다. 소켓 이벤트 핸들러에서 던지면
 * 처리되지 않은 예외로 인스턴스 전체(다른 방 포함)가 내려간다. 보낸 연결만 닫는다.
 */
function handleMessageSafely(room: Room, conn: WebSocket, data: Uint8Array) {
  if (data.byteLength > MAX_MESSAGE_BYTES) {
    conn.close(1009, "message too large");
    return;
  }
  try {
    handleMessage(room, conn, data);
  } catch (err) {
    log(`${short(room.name)} 잘못된 메시지로 연결 종료: ${(err as Error).message}`);
    conn.close(1007, "invalid message");
  }
}

/**
 * 붙어 있는 사람이 아직 멤버인지 확인하고, 아니면 연결을 닫는다.
 * 제외·탈퇴한 사람이 열어 둔 탭으로 계속 읽고 쓰는 것을 막는다.
 */
async function checkMembership(room: Room) {
  if (!room.spaceId || room.conns.size === 0) return;
  const userIds = new Set<string>();
  room.conns.forEach((_owned, conn) => {
    const id = connUser.get(conn);
    if (id) userIds.add(id);
  });
  if (userIds.size === 0) return;
  try {
    const rows = await db
      .select({ userId: spaceMembers.userId })
      .from(spaceMembers)
      .where(and(eq(spaceMembers.spaceId, room.spaceId), inArray(spaceMembers.userId, [...userIds])));
    const members = new Set(rows.map((row) => row.userId));
    room.conns.forEach((_owned, conn) => {
      const id = connUser.get(conn);
      if (id && !members.has(id)) {
        log(`${short(room.name)} 멤버가 아니어서 연결 종료`);
        conn.close(CLOSE_FORBIDDEN, "forbidden");
      }
    });
  } catch (err) {
    // 확인 실패로 멀쩡한 사람을 끊지 않는다. 다음 주기에 다시 본다.
    log(`${short(room.name)} 멤버 확인 실패: ${(err as Error).message}`);
  }
}

/**
 * 방을 정리한다. **먼저 rooms에서 뺀다.**
 * 저장을 기다리는 동안 들어온 연결이 곧 파괴될 doc에 붙으면 그 편집이 사라진다.
 * 빼 두면 새 연결은 새 방을 만들고, 새 방은 이 저장이 끝난 뒤에 DB를 읽는다.
 */
async function closeRoom(room: Room) {
  if (rooms.get(room.name) !== room || room.conns.size > 0) return;
  // 저장 실패한 문서를 파괴하지 않는다. 저장 중 재접속한 사람도 이 방을 계속 쓴다.
  if (room.dirty) await snapshot(room);
  if (rooms.get(room.name) !== room || room.conns.size > 0) return;
  if (room.dirty) {
    room.idleTimer = setTimeout(() => void closeRoom(room), ROOM_IDLE_MS);
    return;
  }
  rooms.delete(room.name);
  if (room.memberTimer) clearInterval(room.memberTimer);
  if (room.saveTimer) clearTimeout(room.saveTimer);
  if (room.revisionTimer) clearTimeout(room.revisionTimer);

  const done = (async () => {
    // 마지막 사람이 나갈 때 남은 변경을 이력에 남긴다. 기다리다 놓치면 안 된다.
    await recordRevision(room);
    await snapshot(room);
  })();
  closingRooms.set(room.name, done);
  try {
    await done;
  } finally {
    if (closingRooms.get(room.name) === done) closingRooms.delete(room.name);
    room.doc.destroy();
    log(`${short(room.name)} 방 정리`);
  }
}

/**
 * 이미 업그레이드가 끝난 소켓을 방에 넣는다. 전송 수단이 무엇이든 여기부터는 같다.
 *
 * `identity`는 업그레이드 라우트가 세션으로 확인한 사용자다. 이력 작성자와
 * awareness 신원 검사, 주기적인 멤버 확인이 모두 이 값을 쓴다.
 * 인증이 없는 로컬 개발 서버만 null을 넘긴다.
 *
 * 리스너를 이 안에서 붙이는 이유는 순서 때문이다. 방 상태를 DB에서 불러오는
 * 동안(첫 접속자면 왕복 한 번) 클라이언트는 이미 동기화 요청을 보낸다.
 * 불러오기를 await한 뒤에 리스너를 붙이면 그 사이 도착한 메시지가 사라져서
 * 영영 동기화가 끝나지 않는다. 그래서 준비될 때까지 버퍼에 담아 둔다.
 *
 * **소켓이 닫힐 때까지 끝나지 않는 약속을 돌려준다.** 서버리스에서 이게 필요하다 —
 * 업그레이드 핸들러가 먼저 끝나면 런타임은 요청이 끝난 줄 알고 호출을 정리하고,
 * 방금 붙은 소켓까지 같이 끊는다. 개발 서버는 이 값을 쓰지 않는다.
 */
export function joinRoom(
  roomName: string,
  conn: WebSocket,
  identity: { userId: string; spaceId: string } | null = null,
): Promise<void> {
  const room = getRoom(roomName, identity?.spaceId ?? null);
  room.conns.set(conn, new Set());
  if (identity) connUser.set(conn, identity.userId);
  conn.binaryType = "arraybuffer";
  if (room.spaceId && !room.memberTimer) {
    room.memberTimer = setInterval(() => void checkMembership(room), MEMBERSHIP_CHECK_MS);
  }

  let ready = false;
  const pending: Uint8Array[] = [];
  let pendingBytes = 0;
  let onClosed: () => void;
  const closed = new Promise<void>((resolve) => {
    onClosed = resolve;
  });

  conn.on("message", (data: ArrayBuffer | Buffer) => {
    const bytes = new Uint8Array(data as ArrayBuffer);
    if (ready) {
      handleMessageSafely(room, conn, bytes);
      return;
    }
    // 복원을 기다리는 동안 쌓이는 양에도 상한을 둔다.
    pendingBytes += bytes.byteLength;
    if (pendingBytes > MAX_MESSAGE_BYTES * 4) {
      pending.length = 0;
      conn.close(1009, "too much data before sync");
      return;
    }
    pending.push(bytes);
  });

  // ws는 maxPayload 초과·프레임 오류를 'error'로 알린다. 듣는 쪽이 없으면 프로세스가 죽는다.
  conn.on("error", (err: Error) => {
    log(`${short(roomName)} 소켓 오류: ${err.message}`);
  });

  conn.on("close", () => {
    onClosed();
    const owned = room.conns.get(conn);
    room.conns.delete(conn);
    room.ackConns.delete(conn);
    if (owned && owned.size > 0) {
      awarenessProtocol.removeAwarenessStates(room.awareness, [...owned], null);
    }

    if (room.conns.size === 0) {
      if (room.memberTimer) {
        clearInterval(room.memberTimer);
        room.memberTimer = undefined;
      }
      if (room.loadFailed) { room.doc.destroy(); return; }
      if (room.idleTimer) clearTimeout(room.idleTimer);
      room.idleTimer = setTimeout(() => void closeRoom(room), ROOM_IDLE_MS);
    }
  });

  void room.loaded.then(() => {
    if (!room.loadedOk) { pending.length = 0; conn.close(1013, "문서 복원 실패. 다시 연결하세요."); return; }
    if (conn.readyState !== conn.OPEN) return;
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
    for (const bytes of pending) handleMessageSafely(room, conn, bytes);
    pending.length = 0;

    log(`${short(roomName)} 접속 · 현재 ${room.conns.size}명`);
  });

  return closed;
}

/** 프로세스가 내려가기 직전에 부른다. 열려 있는 방의 이력과 스냅샷을 모두 저장한다. */
export async function flushRooms() {
  await Promise.all([...rooms.values()].map(recordRevision));
  await Promise.all([...rooms.values()].map(snapshot));
}

function short(id: string) {
  return id.slice(0, 8);
}

function log(msg: string) {
  process.stdout.write(`[collab] ${msg}\n`);
}
