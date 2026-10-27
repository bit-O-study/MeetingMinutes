import path from "node:path";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { attachmentIdPattern } from "./attachment-input";

// Windows 배포 시 릴리스 폴더 밖의 영구 디렉터리를 지정한다. 서버리스 임시 디스크로 저장 성공을 가장하지 않는다.
export function uploadDirectory() {
  if (process.env.VERCEL) throw new Error("이 배포에는 영구 파일 저장소가 연결되지 않았습니다.");
  const configured = process.env.MOA_UPLOAD_DIR?.trim() || undefined;
  if (process.env.NODE_ENV === "production" && !configured) throw new Error("운영 서버의 영구 업로드 경로를 지정해 주세요.");
  if (configured && !path.isAbsolute(configured)) throw new Error("MOA_UPLOAD_DIR은 절대 경로여야 합니다.");
  return configured ?? path.resolve(".data", "uploads");
}
function filePath(id: string) {
  if (!attachmentIdPattern.test(id)) throw new Error("올바르지 않은 파일 ID입니다.");
  return path.join(/* turbopackIgnore: true */ uploadDirectory(), id);
}
export async function writeAttachmentFile(id: string, data: Uint8Array) {
  await mkdir(uploadDirectory(), { recursive: true });
  await writeFile(filePath(id), data, { flag: "wx", mode: 0o600 });
}
export async function readAttachmentFile(id: string) { return readFile(/* turbopackIgnore: true */ filePath(id)); }
export async function removeAttachmentFile(id: string) { await unlink(filePath(id)); }
