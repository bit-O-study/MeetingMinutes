"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";

/**
 * 공동 편집 연결.
 *
 * 저장 버튼이 없으므로 연결 상태 표시가 유일한 안심 신호다.
 * 오프라인일 때 "입력은 저장됩니다"를 함께 보여 줘서 작업을 멈추지 않게 한다.
 *
 * ── 왜 방(room)을 모듈 바깥에 두는가 ───────────────────────
 * 이전에는 effect 안에서 provider를 만들고 `setProvider`로 넘겼다. 그러면
 * (1) 렌더 → effect → setState → 재렌더가 한 번 더 돌고, 그 사이에 에디터가
 * 커서 확장 없이 한 번 만들어졌다 버려진다. (2) React 19의
 * `set-state-in-effect` 규칙에도 걸린다.
 *
 * 그래서 연결을 React 바깥의 레지스트리로 옮기고, 렌더 중에 방을 확보한다.
 * 에디터는 첫 마운트에 provider를 받고, React는 상태 변화만 구독한다.
 */
export type ConnectionState = "connected" | "connecting" | "offline";

export type CollabUser = {
  id: string;
  name: string;
  image?: string | null;
  color: string;
};

export type CollabPeer = CollabUser & { clientId: number };

/** 구독으로 전달되는 값. provider·doc은 방에 고정이라 여기 넣지 않는다. */
type Snapshot = {
  status: ConnectionState;
  syncedAt: Date | null;
  peers: CollabPeer[];
};

/** 서버 렌더와 하이드레이션이 같은 값을 보게 하는 초기 스냅샷. */
const INITIAL: Snapshot = { status: "connecting", syncedAt: null, peers: [] };

/**
 * 마지막 구독이 끊긴 뒤 방을 붙잡아 두는 시간.
 *
 * 0으로 두면 StrictMode의 마운트-언마운트-재마운트에서 소켓을 한 번 버리고
 * 다시 붙인다. 반대로 길게 잡으면 노트를 닫은 사람의 아바타가 남의 화면에
 * 그만큼 남는다 — 아바타는 소켓이 끊겨야 사라진다.
 */
const ROOM_GRACE_MS = 1000;

type Room = {
  doc: Y.Doc;
  provider: WebsocketProvider | null;
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => Snapshot;
  setUser: (me: CollabUser) => void;
};

const rooms = new Map<string, Room>();

/**
 * 붙을 곳을 정한다.
 *
 * 개발에서는 `npm run collab`이 띄우는 :1234로 간다. Next가 라우트를 다시
 * 컴파일해도 연결이 끊기지 않기 때문이다.
 * 배포에는 별도 서버가 없다 — 같은 호스트의 `/api/collab` 라우트가 업그레이드를 받는다.
 * `NEXT_PUBLIC_COLLAB_URL`을 채우면 둘 다 무시하고 그리로 간다.
 */
function collabUrl(): string {
  const configured = process.env.NEXT_PUBLIC_COLLAB_URL;
  if (configured) return configured;
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  if (process.env.NODE_ENV === "production") {
    return `${proto}//${window.location.host}/api/collab`;
  }
  return `${proto}//${window.location.hostname}:1234`;
}

/** 접속자 목록. 같은 사람이 여러 탭을 열어도 한 번만 센다. */
function readPeers(provider: WebsocketProvider): CollabPeer[] {
  const peers: CollabPeer[] = [];
  const seen = new Set<string>();
  provider.awareness.getStates().forEach((state, clientId) => {
    const u = (state as { user?: CollabUser }).user;
    if (!u?.id || seen.has(u.id)) return;
    seen.add(u.id);
    peers.push({ ...u, clientId });
  });
  return peers;
}

/**
 * awareness는 커서가 움직일 때마다 바뀐다. 그대로 흘리면 남이 타이핑하는 동안
 * 워크스페이스가 계속 다시 그려진다. 아바타에 보이는 값만 비교해서 거른다.
 */
function samePeers(a: CollabPeer[], b: CollabPeer[]): boolean {
  return (
    a.length === b.length &&
    a.every((p, i) => p.id === b[i].id && p.name === b[i].name && p.color === b[i].color)
  );
}

function createRoom(noteId: string, me: CollabUser): Room {
  const doc = new Y.Doc();
  const provider = new WebsocketProvider(collabUrl(), noteId, doc, { connect: true });

  let snapshot: Snapshot = INITIAL;
  let refs = 0;
  let sweep: ReturnType<typeof setTimeout> | null = null;
  const listeners = new Set<() => void>();

  const emit = (next: Partial<Snapshot>) => {
    snapshot = { ...snapshot, ...next };
    for (const listener of listeners) listener();
  };

  const onStatus = ({ status }: { status: string }) => {
    const next: ConnectionState = status === "connected" ? "connected" : "connecting";
    if (next !== snapshot.status) emit({ status: next });
  };
  const onSync = (isSynced: boolean) => {
    if (isSynced) emit({ syncedAt: new Date() });
  };
  const onOffline = () => emit({ status: "offline" });
  const onOnline = () => emit({ status: "connecting" });
  const onAwareness = () => {
    const peers = readPeers(provider);
    if (!samePeers(peers, snapshot.peers)) emit({ peers });
  };

  provider.on("status", onStatus);
  provider.on("sync", onSync);
  provider.awareness.on("change", onAwareness);
  window.addEventListener("offline", onOffline);
  window.addEventListener("online", onOnline);

  const setUser = (user: CollabUser) => {
    // 아바타 색 = 커서 색. 아바타를 보면 누구 커서인지 바로 알아야 한다.
    provider.awareness.setLocalStateField("user", {
      id: user.id,
      name: user.name,
      color: user.color,
      image: user.image ?? null,
    });
  };
  setUser(me);
  onAwareness();

  const teardown = () => {
    if (rooms.get(noteId) !== room) return;
    rooms.delete(noteId);
    provider.off("status", onStatus);
    provider.off("sync", onSync);
    provider.awareness.off("change", onAwareness);
    window.removeEventListener("offline", onOffline);
    window.removeEventListener("online", onOnline);
    provider.destroy();
    doc.destroy();
  };

  const room: Room = {
    doc,
    provider,
    getSnapshot: () => snapshot,
    setUser,
    subscribe: (listener) => {
      listeners.add(listener);
      refs += 1;
      if (sweep) {
        clearTimeout(sweep);
        sweep = null;
      }
      return () => {
        listeners.delete(listener);
        refs -= 1;
        if (refs === 0) sweep = setTimeout(teardown, ROOM_GRACE_MS);
      };
    },
  };

  // 렌더가 버려져 아무도 구독하지 않은 방도 같은 타이머로 정리한다.
  sweep = setTimeout(() => {
    if (refs === 0) teardown();
  }, ROOM_GRACE_MS);

  return room;
}

/** 서버 렌더용 빈 방. 소켓이 없고 스냅샷은 초기값에서 움직이지 않는다. */
let serverRoom: Room | null = null;
function emptyRoom(): Room {
  serverRoom ??= {
    doc: new Y.Doc(),
    provider: null,
    getSnapshot: () => INITIAL,
    setUser: () => {},
    subscribe: () => () => {},
  };
  return serverRoom;
}

function acquireRoom(noteId: string, me: CollabUser): Room {
  if (typeof window === "undefined") return emptyRoom();
  const existing = rooms.get(noteId);
  if (existing) return existing;
  const room = createRoom(noteId, me);
  rooms.set(noteId, room);
  return room;
}

export function useCollab(noteId: string, me: CollabUser) {
  const { id, name, color, image } = me;

  // 렌더 중에 확보한다. 에디터가 첫 마운트에 provider를 받아야 커서 확장 없이
  // 만들어졌다 버려지는 일이 없다. 두 번 불려도 레지스트리가 같은 방을 준다.
  const room = useMemo(
    () => acquireRoom(noteId, { id, name, color, image }),
    [noteId, id, name, color, image],
  );

  // 이름·색이 바뀌면 남의 화면의 커서 이름표까지 따라가야 한다.
  useEffect(() => {
    room.setUser({ id, name, color, image });
  }, [room, id, name, color, image]);

  const { status, syncedAt, peers } = useSyncExternalStore(
    room.subscribe,
    room.getSnapshot,
    () => INITIAL,
  );

  return { doc: room.doc, provider: room.provider, status, syncedAt, peers };
}
