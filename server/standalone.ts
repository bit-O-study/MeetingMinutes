/** 내부 서버에서는 Next HTTP와 공동 편집 소켓을 같은 공개 포트로 제공한다. */
import http from "node:http";
import { spawn } from "node:child_process";
import path from "node:path";
import { WebSocketServer } from "ws";
import { flushRooms, joinRoom } from "../src/lib/collab/room";
import { MAX_MESSAGE_BYTES } from "../src/lib/collab/protocol-guard";
import { sql } from "../src/lib/db";

const port = Number(process.env.PORT ?? 3000);
const upstreamPort = Number(process.env.MOA_HTTP_PORT ?? port + 10000);
const hostname = process.env.HOSTNAME ?? "127.0.0.1";
const child = spawn(process.execPath, ["--require", path.join(__dirname, "next-lifecycle.cjs"), path.join(__dirname, "next-server.js")], {
  env: { ...process.env, PORT: String(upstreamPort), HOSTNAME: "127.0.0.1" },
  stdio: ["inherit", "inherit", "inherit", "ipc"], windowsHide: true,
});
const server = http.createServer((req, res) => {
  const proxy = http.request({ hostname: "127.0.0.1", port: upstreamPort, path: req.url, method: req.method, headers: req.headers }, (reply) => {
    res.writeHead(reply.statusCode ?? 502, reply.headers);
    reply.pipe(res);
  });
  proxy.on("error", () => { if (!res.headersSent) res.writeHead(503); res.end(); });
  req.on("aborted", () => proxy.destroy());
  req.pipe(proxy);
});
const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });
server.on("upgrade", (req, socket, head) => {
  socket.on("error", () => {});
  void (async () => {
    const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
    const match = /^\/api\/collab\/([0-9a-f-]{36})$/i.exec(pathname);
    const reject = (status: number) => socket.end(`HTTP/1.1 ${status} Rejected\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
    if (!match) return reject(404);
    // 다른 사이트에서 세션 쿠키를 이용해 소켓을 여는 것을 차단한다.
    if (!req.headers.origin || new URL(req.headers.origin).host !== req.headers.host) return reject(403);
    const response = await fetch(`http://127.0.0.1:${upstreamPort}${pathname}`, {
      headers: { cookie: req.headers.cookie ?? "", host: req.headers.host ?? "localhost" },
      redirect: "manual", signal: AbortSignal.timeout(10000),
    });
    // Next의 requireNoteAccess를 통과한 사용자만 방에 참여한다.
    if (!response.ok) return reject(response.status === 401 ? 401 : 404);
    const identity = await response.json() as { userId: string; spaceId: string };
    if (!identity.userId || !identity.spaceId) return reject(503);
    if (socket.destroyed) return;
    wss.handleUpgrade(req, socket, head, (ws) => {
      void joinRoom(match[1], ws, identity).catch((error: unknown) => {
        console.error("[collab] room failed", error);
        ws.close(1011, "Connection failed");
      });
    });
  })().catch(() => { if (!socket.destroyed) socket.end("HTTP/1.1 503 Unavailable\r\nConnection: close\r\nContent-Length: 0\r\n\r\n"); });
});
let stopping = false;
async function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  server.close();
  for (const ws of wss.clients) ws.close(1012, "Server restarting");
  const deadline = setTimeout(() => { child.kill(); process.exit(1); }, 10000);
  deadline.unref();
  try { await flushRooms(); await sql.end({ timeout: 5 }); }
  finally { child.kill(); process.exit(code); }
}
child.on("exit", (code) => { void shutdown(code ?? 1); });
child.on("error", () => { void shutdown(1); });
server.on("error", () => { void shutdown(1); });
process.on("SIGTERM", () => { void shutdown(); });
process.on("SIGINT", () => { void shutdown(); });
server.listen(port, hostname, () => console.log(`[moa] HTTP and collaboration listening on ${hostname}:${port}`));
