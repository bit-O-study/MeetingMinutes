import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { EventEmitter } from "node:events";
import { runInNewContext } from "node:vm";
import ts from "typescript";

test("DB 복원 실패 시 빈 문서를 보내거나 저장하지 않고 다음 연결에서 재시도한다", async () => {
  const require = createRequire(import.meta.url);
  let reads = 0, writes = 0;
  const db = {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => { reads++; throw new Error("test unavailable"); } }) }) }),
    insert: () => { writes++; throw new Error("must not write"); },
  };
  const output = ts.transpileModule(readFileSync(new URL("./room.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const exports: { joinRoom?: (id: string, socket: unknown) => Promise<void>; roomCount?: () => number; flushRooms?: () => Promise<void> } = {};
  runInNewContext(output, { exports, Buffer, Uint8Array, setTimeout, clearTimeout, process: { env: {}, stdout: { write() {} } }, require: (id: string) => {
    if (id === "@/lib/templates") return { docToPlainText: () => "" };
    if (id === "@/lib/db") return { db };
    if (id === "@/lib/db/schema") return { noteDocs: {}, noteRevisions: {} };
    if (id === "@/lib/revision-summary") return { sectionsFromDoc: () => [], summarizeChange: () => null };
    return require(id);
  } });
  class Socket extends EventEmitter {
    OPEN = 1; readyState = 1; sent = 0; code = 0;
    send() { this.sent++; }
    close(code: number) { this.code = code; this.readyState = 3; this.emit("close"); }
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    const socket = new Socket();
    const closed = exports.joinRoom!("test-note", socket);
    socket.emit("message", new Uint8Array([0, 0]));
    await closed;
    assert.equal(socket.code, 1013);
    assert.equal(socket.sent, 0);
    assert.equal(exports.roomCount!(), 0);
  }
  await exports.flushRooms!();
  assert.equal(reads, 2);
  assert.equal(writes, 0);
});
