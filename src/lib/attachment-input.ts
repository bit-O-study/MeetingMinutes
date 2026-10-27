import { createHash } from "node:crypto";

export const IMAGE_LIMIT = 5 * 1024 * 1024;
export const PACKAGE_LIMIT = 64 * 1024 * 1024;
export const attachmentIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type AttachmentKind = "image" | "package";

// 파일명과 브라우저의 MIME만 믿지 않고 실제 헤더를 확인한다. 파일을 실행하거나 압축 해제하지 않는다.
export function inspectAttachment(name: string, bytes: Uint8Array, kind: AttachmentKind) {
  const cleanName = name.normalize("NFC").replace(/[\x00-\x1f\x7f/\\]/g, "_").trim();
  if (!cleanName || cleanName.length > 180) throw new Error("파일 이름은 1~180자로 정해 주세요.");
  const limit = kind === "image" ? IMAGE_LIMIT : PACKAGE_LIMIT;
  if (!bytes.length || bytes.length > limit) throw new Error(kind === "image" ? "사진은 5MB 이하로 올려 주세요." : "패키지는 64MB 이하로 올려 주세요.");
  const data = Buffer.from(bytes);
  let mime: string;
  if (kind === "image") {
    if (/\.png$/i.test(cleanName) && data.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) mime = "image/png";
    else if (/\.jpe?g$/i.test(cleanName) && data[0] === 255 && data[1] === 216 && data[2] === 255) mime = "image/jpeg";
    else if (/\.webp$/i.test(cleanName) && data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WEBP") mime = "image/webp";
    else throw new Error("JPG, PNG, WebP 사진 파일을 선택해 주세요.");
  } else {
    if (!/\.(apk|aab|apks|zip)$/i.test(cleanName)) throw new Error("APK, AAB, APKS 또는 ZIP 파일을 선택해 주세요.");
    const entries = zipEntries(data);
    if (/\.apk$/i.test(cleanName) && !entries.includes("AndroidManifest.xml")) throw new Error("AndroidManifest.xml이 있는 APK 파일을 선택해 주세요.");
    if (/\.aab$/i.test(cleanName) && !entries.includes("base/manifest/AndroidManifest.xml")) throw new Error("Android 앱 번들 파일을 확인해 주세요.");
    mime = /\.apk$/i.test(cleanName) ? "application/vnd.android.package-archive" : "application/zip";
  }
  return { name: cleanName, mime, size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
}

function zipEntries(data: Buffer): string[] {
  let end = -1;
  for (let i = data.length - 22; i >= Math.max(0, data.length - 65557); i--) {
    if (data.readUInt32LE(i) === 0x06054b50 && i + 22 + data.readUInt16LE(i + 20) === data.length) { end = i; break; }
  }
  if (end < 0 || data.readUInt16LE(end + 4) || data.readUInt16LE(end + 6)) throw new Error("손상되지 않은 단일 패키지 파일을 선택해 주세요.");
  const count = data.readUInt16LE(end + 10);
  let offset = data.readUInt32LE(end + 16);
  const centralEnd = offset + data.readUInt32LE(end + 12);
  if (!count || count > 20000 || centralEnd !== end) throw new Error("지원하지 않는 패키지 구조입니다.");
  const names: string[] = [];
  for (let i = 0; i < count; i++) {
    if (offset + 46 > centralEnd || data.readUInt32LE(offset) !== 0x02014b50) throw new Error("패키지 파일 목록이 올바르지 않습니다.");
    const length = data.readUInt16LE(offset + 28), extra = data.readUInt16LE(offset + 30), comment = data.readUInt16LE(offset + 32);
    if (offset + 46 + length + extra + comment > centralEnd || (data.readUInt16LE(offset + 8) & 1)) throw new Error("암호화되거나 손상된 패키지는 올릴 수 없습니다.");
    names.push(data.toString("utf8", offset + 46, offset + 46 + length));
    offset += 46 + length + extra + comment;
  }
  if (offset !== centralEnd) throw new Error("패키지 파일 목록이 올바르지 않습니다.");
  return names;
}

export function containsAttachment(content: unknown, id: string): boolean {
  if (!attachmentIdPattern.test(id)) return false;
  const pending: unknown[] = [content];
  let visited = 0;
  while (pending.length && visited++ < 100000) {
    const node = pending.pop();
    if (!node || typeof node !== "object") continue;
    if (Array.isArray(node)) { pending.push(...node); continue; }
    const value = node as { type?: unknown; attrs?: { src?: unknown }; content?: unknown };
    if (value.type === "image" && value.attrs?.src === `/api/attachments/${id}`) return true;
    if (value.content) pending.push(value.content);
  }
  return false;
}
