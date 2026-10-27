import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { mkdir, readFile, writeFile, unlink, stat, statfs } from "node:fs/promises";
import path from "node:path";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { sql } from "./db";
import { inspectAttachment } from "./attachment-input";
import { verifyStorageTicket } from "./storage-ticket";
import { uploadDirectory } from "./attachment-storage";

let started = false;
export async function startStorageWorker() {
  if (started) return;
  const directory = uploadDirectory();
  const statePath = path.join(directory, "tunnel-state.json");
  const executable = process.env.MOA_CLOUDFLARED_PATH;
  const origin = process.env.NEXT_PUBLIC_APP_URL;
  if (!executable || !origin?.startsWith("https://")) throw new Error("Storage worker configuration missing");
  await mkdir(directory, { recursive: true });
  let endpoint = "", active = 0, closing = false, tunnel: ChildProcess | undefined;
  // 재배포 때 남은 터널은 PID와 실제 실행 경로·포트를 모두 대조한 뒤 정리한다.
  try {
    const previous = JSON.parse(await readFile(statePath, "utf8"));
    if (process.platform === "win32" && Number.isInteger(previous.pid)) {
      const command = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `(Get-CimInstance Win32_Process -Filter 'ProcessId = ${previous.pid}').CommandLine`], { encoding: "utf8", windowsHide: true }).toLowerCase();
      if (command.includes(executable.toLowerCase()) && command.includes("127.0.0.1:4192")) { try { process.kill(previous.pid); } catch {} }
    }
  } catch {}
  const server = createServer(async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
    const requestOrigin = req.headers.origin;
    if (requestOrigin === origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
      res.setHeader("Access-Control-Allow-Methods", "PUT, GET, OPTIONS");
    }
    if (requestOrigin && requestOrigin !== origin) { res.writeHead(403).end(); return; }
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname === "/health" && req.method === "GET") { res.writeHead(200).end("ok"); return; }
    if (url.pathname !== "/files") { res.writeHead(404).end(); return; }
    if (req.method === "OPTIONS") { res.writeHead(requestOrigin === origin ? 204 : 403).end(); return; }
    const respond = (status: number, data: object) => { res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" }).end(JSON.stringify(data)); };
    let ticket;
    try { ticket = verifyStorageTicket(req.method === "GET" ? url.searchParams.get("ticket") ?? "" : (req.headers.authorization ?? "").replace(/^Bearer /, "")); }
    catch { respond(403, { error: "파일 접근 시간이 만료됐어요. 자료실에서 다시 시도해 주세요." }); return; }
    if ((req.method !== "PUT" || ticket.action !== "upload") && (req.method !== "GET" || ticket.action !== "download")) { respond(403, { error: "접근할 수 없습니다." }); return; }
    if (active >= 2) { respond(503, { error: "파일 서버가 사용 중이에요. 잠시 후 다시 시도해 주세요." }); return; }
    active++;
    try {
      const [member] = await sql`select 1 from space_members m join spaces s on s.id = m.space_id where m.space_id = ${ticket.spaceId} and m.user_id = ${ticket.userId} and s.deleted_at is null`;
      if (!member) { respond(404, { error: "접근할 수 없습니다." }); return; }
      const destination = path.join(directory, ticket.id);
      if (ticket.action === "download") {
        const [file] = await sql`select name, mime, size from project_files where id = ${ticket.id} and space_id = ${ticket.spaceId} and kind = 'package'`;
        if (!file || (await stat(destination)).size !== file.size) { respond(404, { error: "파일을 찾을 수 없습니다." }); return; }
        res.writeHead(200, { "Content-Type": file.mime, "Content-Length": String(file.size), "Content-Disposition": `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(file.name).replaceAll("'", "%27")}` });
        await pipeline(createReadStream(destination), res);
        return;
      }
      const [existing] = await sql`select 1 from project_files where id = ${ticket.id}`;
      if (existing) { respond(409, { error: "이미 올린 파일입니다. 자료실을 새로고침해 주세요." }); return; }
      if (Number(req.headers["content-length"]) !== ticket.size) { respond(400, { error: "파일 크기가 변경됐어요." }); return; }
      const disk = await statfs(directory);
      if (disk.bavail * disk.bsize < ticket.size! + 1024 * 1024 * 1024) { respond(507, { error: "서버 저장 공간이 부족합니다." }); return; }
      req.setTimeout(120000, () => req.destroy());
      const chunks: Buffer[] = []; let length = 0;
      for await (const chunk of req) {
        length += chunk.length;
        if (length > ticket.size!) throw new Error("Size exceeded");
        chunks.push(Buffer.from(chunk));
      }
      if (length !== ticket.size) throw new Error("Size mismatch");
      let metadata;
      try { metadata = inspectAttachment(ticket.name!, Buffer.concat(chunks), "package"); }
      catch { respond(400, { error: "올바른 APK·AAB·APKS·ZIP 파일을 선택해 주세요." }); return; }
      await writeFile(destination, Buffer.concat(chunks), { flag: "wx", mode: 0o600 });
      try {
        // 업로드 도중 멤버 권한이 회수되면 메타데이터도 등록하지 않는다.
        const inserted = await sql`insert into project_files (id, space_id, note_id, kind, name, mime, size, sha256, version_label, description, uploaded_by)
          select ${ticket.id}, ${ticket.spaceId}, null, 'package', ${metadata.name}, ${metadata.mime}, ${metadata.size}, ${metadata.sha256}, ${ticket.version!}, ${ticket.description!}, ${ticket.userId}
          where exists (select 1 from space_members m join spaces s on s.id = m.space_id where m.space_id = ${ticket.spaceId} and m.user_id = ${ticket.userId} and s.deleted_at is null) returning id`;
        if (!inserted.length) throw new Error("Membership revoked");
      } catch (error) { await unlink(destination).catch(() => {}); throw error; }
      respond(201, { id: ticket.id, ...metadata });
    } catch {
      if (!res.headersSent) respond(503, { error: "파일 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요." });
      else res.destroy();
    } finally { active--; }
  });
  server.requestTimeout = 150000;
  server.headersTimeout = 15000;
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(4192, "127.0.0.1", resolve); });
  started = true;
  async function publish() {
    if (!endpoint) return;
    try {
      const health = await fetch(endpoint + "/health", { signal: AbortSignal.timeout(5000) });
      if (!health.ok || await health.text() !== "ok") return;
      await sql`insert into storage_endpoints (id, endpoint, heartbeat) values ('primary', ${endpoint}, now()) on conflict (id) do update set endpoint = excluded.endpoint, heartbeat = excluded.heartbeat`;
    } catch { /* 연결이 끊기면 heartbeat가 만료되어 새 전송을 중지한다. */ }
  }
  function connect() {
    if (closing) return;
    endpoint = "";
    tunnel = spawn(executable!, ["tunnel", "--no-autoupdate", "--url", "http://127.0.0.1:4192"], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
    let buffer = "";
    tunnel.stderr?.on("data", (chunk: Buffer) => {
      buffer = (buffer + chunk.toString()).slice(-16000);
      const address = buffer.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (!endpoint && address) { endpoint = address[0]; void publish(); }
    });
    void writeFile(statePath, JSON.stringify({ pid: tunnel.pid })).catch(() => {});
    tunnel.once("error", () => console.error("Storage tunnel could not start"));
    tunnel.once("close", () => { endpoint = ""; if (!closing) setTimeout(connect, 10000).unref(); });
  }
  connect();
  const interval = setInterval(() => void publish(), 10000); interval.unref();
  process.once("exit", () => { closing = true; tunnel?.kill(); });
  console.info("Storage worker listening on loopback; persistent disk enabled");
}
