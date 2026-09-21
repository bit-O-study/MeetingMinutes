/**
 * 공동 편집 WebSocket 서버 (로컬 개발용)
 *
 *   npm run collab
 *
 * 프로토콜·스냅샷·이력은 전부 `src/lib/collab/room.ts`에 있다.
 * 이 파일은 소켓을 받아 방에 넘겨 주는 껍데기다.
 *
 * 배포에서는 같은 room 모듈을 `app/api/collab/[noteId]` 라우트가 쓴다.
 * 개발에서 별도 서버를 그대로 두는 이유는 두 가지다.
 *   · `next dev`가 라우트를 다시 컴파일할 때 연결이 끊기지 않는다
 *   · 로그가 한 줄기로 모여서 동기화 문제를 쫓기 쉽다
 */
import http from "node:http";
import { WebSocketServer, type WebSocket } from "ws";

import { sql } from "../src/lib/db";
import { flushRooms, joinRoom, roomCount } from "../src/lib/collab/room";

const PORT = Number(process.env.COLLAB_PORT ?? 1234);

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, rooms: roomCount() }));
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

  /*
    개발 서버에는 권한 검사가 없다. 세션 쿠키를 여기서 다시 풀어야 하는데,
    로그인은 Next 쪽에 있고 이 프로세스는 localhost에만 떠 있기 때문이다.
    배포 경로(app/api/collab)는 requireNoteAccess를 거친다.
  */
  joinRoom(roomName, conn);
});

server.listen(PORT, () => {
  log(`공동 편집 서버 ws://localhost:${PORT}`);
});

async function shutdown() {
  log("스냅샷 저장 중…");
  await flushRooms();
  await sql.end({ timeout: 5 });
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function log(msg: string) {
  process.stdout.write(`[collab] ${msg}\n`);
}
