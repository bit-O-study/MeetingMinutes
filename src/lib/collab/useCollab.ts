"use client";

import { useEffect, useMemo, useState } from "react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";

/**
 * 공동 편집 연결.
 *
 * 저장 버튼이 없으므로 연결 상태 표시가 유일한 안심 신호다.
 * 오프라인일 때 "입력은 저장됩니다"를 함께 보여 줘서 작업을 멈추지 않게 한다.
 */
export type ConnectionState = "connected" | "connecting" | "offline";

export type CollabUser = {
  id: string;
  name: string;
  image?: string | null;
  color: string;
};

export type CollabPeer = CollabUser & { clientId: number };

function collabUrl(): string {
  const configured = process.env.NEXT_PUBLIC_COLLAB_URL;
  if (configured) return configured;
  if (typeof window === "undefined") return "ws://localhost:1234";
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.hostname}:1234`;
}

export function useCollab(noteId: string, me: CollabUser) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const doc = useMemo(() => new Y.Doc(), [noteId]);
  const [provider, setProvider] = useState<WebsocketProvider | null>(null);
  const [status, setStatus] = useState<ConnectionState>("connecting");
  const [syncedAt, setSyncedAt] = useState<Date | null>(null);
  const [peers, setPeers] = useState<CollabPeer[]>([]);

  useEffect(() => {
    const wsProvider = new WebsocketProvider(collabUrl(), noteId, doc, { connect: true });

    // 아바타 색 = 커서 색. 아바타를 보면 누구 커서인지 바로 알아야 한다.
    wsProvider.awareness.setLocalStateField("user", {
      id: me.id,
      name: me.name,
      color: me.color,
      image: me.image ?? null,
    });

    const onStatus = ({ status: s }: { status: string }) =>
      setStatus(s === "connected" ? "connected" : "connecting");
    const onSync = (isSynced: boolean) => {
      if (isSynced) setSyncedAt(new Date());
    };
    const onOffline = () => setStatus("offline");
    const onOnline = () => setStatus("connecting");

    const onAwareness = () => {
      const next: CollabPeer[] = [];
      wsProvider.awareness.getStates().forEach((state, clientId) => {
        const u = (state as { user?: CollabUser }).user;
        if (u?.id) next.push({ ...u, clientId });
      });
      // 같은 사람이 여러 탭을 열어도 한 번만 센다.
      const seen = new Set<string>();
      setPeers(
        next.filter((p) => {
          if (seen.has(p.id)) return false;
          seen.add(p.id);
          return true;
        }),
      );
    };

    wsProvider.on("status", onStatus);
    wsProvider.on("sync", onSync);
    wsProvider.awareness.on("change", onAwareness);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    onAwareness();

    setProvider(wsProvider);

    return () => {
      wsProvider.off("status", onStatus);
      wsProvider.off("sync", onSync);
      wsProvider.awareness.off("change", onAwareness);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      wsProvider.destroy();
      doc.destroy();
    };
  }, [doc, noteId, me.id, me.name, me.color, me.image]);

  return { doc, provider, status, syncedAt, peers };
}
