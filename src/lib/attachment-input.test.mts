import test from "node:test";
import assert from "node:assert/strict";
import { inspectAttachment, containsAttachment, IMAGE_LIMIT } from "./attachment-input";
import { mkdtemp, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { readAttachmentFile, removeAttachmentFile, writeAttachmentFile, uploadDirectory } from "./attachment-storage";

function archive(names: string[]) {
  const files: Buffer[] = [], directory: Buffer[] = [];
  let offset = 0;
  for (const name of names) {
    const bytes = Buffer.from(name);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(bytes.length, 26);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50); central.writeUInt16LE(bytes.length, 28); central.writeUInt32LE(offset, 42);
    files.push(local, bytes); directory.push(central, bytes); offset += local.length + bytes.length;
  }
  const index = Buffer.concat(directory), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(names.length, 8); end.writeUInt16LE(names.length, 10); end.writeUInt32LE(index.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...files, index, end]);
}

test("첨부: 실제 사진 헤더·확장자·파일 크기를 함께 검증한다", () => {
  const png = Buffer.from([137,80,78,71,13,10,26,10,0]);
  assert.equal(inspectAttachment("사진.png", png, "image").mime, "image/png");
  assert.match(inspectAttachment("../사진.png", png, "image").name, /^\.\._사진/);
  assert.throws(() => inspectAttachment("사진.png", Buffer.from("<svg>"), "image"));
  assert.throws(() => inspectAttachment("사진.svg", png, "image"));
  assert.throws(() => inspectAttachment("사진.png", Buffer.alloc(IMAGE_LIMIT + 1), "image"));
  assert.throws(() => inspectAttachment("", png, "image"));
});

test("첨부: APK manifest·정상 ZIP 목록·암호화 및 잘린 패키지 검사", () => {
  const apk = archive(["AndroidManifest.xml", "classes.dex"]);
  const result = inspectAttachment("moa.apk", apk, "package");
  assert.equal(result.mime, "application/vnd.android.package-archive");
  assert.match(result.sha256, /^[a-f0-9]{64}$/);
  assert.throws(() => inspectAttachment("가짜.apk", archive(["hello.txt"]), "package"));
  assert.throws(() => inspectAttachment("파일.apk", apk.subarray(0, apk.length - 1), "package"));
  assert.equal(inspectAttachment("묶음.zip", archive(["app.apk"]), "package").mime, "application/zip");
  assert.throws(() => inspectAttachment("파일.exe", apk, "package"));
  const encrypted = Buffer.from(apk);
  const central = encrypted.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]));
  encrypted.writeUInt16LE(1, central + 8);
  assert.throws(() => inspectAttachment("암호.zip", encrypted, "package"));
});

test("첨부: 공유 노트의 현재 본문에 있는 정규 첨부 URL만 허용한다", () => {
  const id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  assert.equal(containsAttachment({ type: "doc", content: [{ type: "image", attrs: { src: "/api/attachments/" + id } }] }, id), true);
  assert.equal(containsAttachment({ type: "image", attrs: { src: "https://example.org/api/attachments/" + id } }, id), false);
  assert.equal(containsAttachment({ type: "paragraph", content: [{ type: "text", text: "/api/attachments/" + id }] }, id), false);
  assert.equal(containsAttachment({}, id), false);
});

test("첨부: 고유 경로·덮어쓰기 방지·실제 바이트 보존 및 서버리스 임시 저장 차단", async () => {
  const priorDir = process.env.MOA_UPLOAD_DIR, priorVercel = process.env.VERCEL;
  const directory = await mkdtemp(path.join(tmpdir(), "moa-attachment-"));
  const id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  try {
    delete process.env.VERCEL; process.env.MOA_UPLOAD_DIR = directory;
    await writeAttachmentFile(id, Buffer.from("private package"));
    assert.equal((await readAttachmentFile(id)).toString(), "private package");
    await assert.rejects(writeAttachmentFile(id, Buffer.from("replacement")));
    await assert.rejects(writeAttachmentFile("../escape", Buffer.from("no")));
    process.env.VERCEL = "1";
    assert.throws(uploadDirectory);
  } finally {
    delete process.env.VERCEL; process.env.MOA_UPLOAD_DIR = directory;
    await removeAttachmentFile(id).catch(() => {});
    await rmdir(directory);
    if (priorDir === undefined) delete process.env.MOA_UPLOAD_DIR; else process.env.MOA_UPLOAD_DIR = priorDir;
    if (priorVercel === undefined) delete process.env.VERCEL; else process.env.VERCEL = priorVercel;
  }
});
