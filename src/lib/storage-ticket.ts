import { createHmac, timingSafeEqual } from "node:crypto";
import { attachmentIdPattern, PACKAGE_LIMIT, IMAGE_LIMIT } from "./attachment-input";

export type StorageTicket = { action: "upload" | "download"; id: string; spaceId: string; userId: string; expires: number; review?: true; adminUpload?: true; kind?: "image" | "package"; noteId?: string; name?: string; size?: number; version?: string; description?: string };
function secret() {
  const value = process.env.MOA_STORAGE_SECRET;
  if (!value || value.length < 32) throw new Error("저장소 인증 설정이 없습니다.");
  return value;
}
export function signStorageTicket(ticket: StorageTicket) {
  const body = Buffer.from(JSON.stringify(ticket)).toString("base64url");
  return body + "." + createHmac("sha256", secret()).update("moa-storage-v1:" + body).digest("base64url");
}
export function verifyStorageTicket(token: string, now = Date.now()): StorageTicket {
  if (token.length > 12000) throw new Error("Invalid ticket");
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra) throw new Error("Invalid ticket");
  const expected = createHmac("sha256", secret()).update("moa-storage-v1:" + body).digest();
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(expected, actual)) throw new Error("Invalid ticket");
  const ticket = JSON.parse(Buffer.from(body, "base64url").toString()) as StorageTicket;
  if (ticket.review !== undefined && (ticket.review !== true || ticket.action !== "download")) throw new Error("Invalid ticket scope");
  if (ticket.kind !== undefined && !["image", "package"].includes(ticket.kind)) throw new Error("Invalid kind");
  if (ticket.adminUpload !== undefined && (ticket.adminUpload !== true || ticket.action !== "upload" || ticket.kind === "image")) throw new Error("Invalid upload scope");
  if (ticket.kind === "image" && (!ticket.noteId || !attachmentIdPattern.test(ticket.noteId) || ticket.review || ticket.adminUpload)) throw new Error("Missing note scope");
  if (ticket.kind !== "image" && ticket.noteId !== undefined) throw new Error("Invalid note scope");
  if (![ticket.id, ticket.spaceId, ticket.userId].every(v => typeof v === "string" && attachmentIdPattern.test(v)) || !["upload", "download"].includes(ticket.action) || !Number.isSafeInteger(ticket.expires) || ticket.expires < now || ticket.expires > now + 610000) throw new Error("Invalid ticket");
  if (ticket.action === "upload" && (typeof ticket.name !== "string" || ticket.name.length > 180 || !(ticket.kind === "image" ? /\.(png|jpe?g|webp)$/i : /\.(apk|aab|apks|zip)$/i).test(ticket.name) || !Number.isSafeInteger(ticket.size) || ticket.size! < 1 || ticket.size! > (ticket.kind === "image" ? IMAGE_LIMIT : PACKAGE_LIMIT) || typeof ticket.version !== "string" || ticket.version.length > 60 || typeof ticket.description !== "string" || ticket.description.length > 1000)) throw new Error("Invalid ticket");
  return ticket;
}
