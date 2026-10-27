import { randomUUID } from "node:crypto";
import { requireUser } from "./auth";
import { and, desc, eq } from "drizzle-orm";
import { requireSpaceMember } from "./access";
import { db } from "./db";
import { projectFiles } from "./db/schema";
import { attachmentIdPattern, inspectAttachment, PACKAGE_LIMIT, type AttachmentKind } from "./attachment-input";
import { readAttachmentFile, removeAttachmentFile, uploadDirectory, writeAttachmentFile } from "./attachment-storage";

export async function listProjectPackages(spaceId: string, page = 1) {
  await requireSpaceMember(spaceId);
  const pageSize = 100;
  const currentPage = Number.isSafeInteger(page) && page > 0 && Number.isSafeInteger((page - 1) * pageSize) ? page : 1;
  const rows = await db.select().from(projectFiles).where(and(eq(projectFiles.spaceId, spaceId), eq(projectFiles.kind, "package"))).orderBy(desc(projectFiles.createdAt), desc(projectFiles.id)).limit(pageSize + 1).offset((currentPage - 1) * pageSize);
  return { files: rows.slice(0, pageSize), hasNext: rows.length > pageSize, page: currentPage };
}

export async function uploadAttachment(request: Request, targetId: string, kind: AttachmentKind) {
  if (!attachmentIdPattern.test(targetId)) return Response.json({ error: "접근할 수 없습니다." }, { status: 404 });
  if (kind !== "package") return Response.json({ error: "지원하지 않는 파일입니다." }, { status: 400 });
  const access = await requireSpaceMember(targetId);
  const origin = request.headers.get("origin");
  const requestUrl = new URL(request.url);
  const hostOrigin = request.headers.get("host") ? `${requestUrl.protocol}//${request.headers.get("host")}` : null;
  const allowed = [requestUrl.origin, hostOrigin, process.env.NEXT_PUBLIC_APP_URL].filter(Boolean);
  if (origin && !allowed.includes(origin)) return Response.json({ error: "이 화면에서 다시 올려 주세요." }, { status: 403 });
  try { uploadDirectory(); } catch { return Response.json({ error: "파일 저장소가 연결되지 않았어요. 관리자에게 문의해 주세요." }, { status: 503 }); }
  const max = PACKAGE_LIMIT + 65536;
  const length = Number(request.headers.get("content-length"));
  if (length > max) return Response.json({ error: "파일이 너무 큽니다." }, { status: 413 });
  if (!request.body || !request.headers.get("content-type")?.startsWith("multipart/form-data;")) return Response.json({ error: "파일을 선택해 주세요." }, { status: 400 });
  let form: FormData;
  try {
    let count = 0;
    const bounded = request.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({ transform(chunk, controller) {
      count += chunk.byteLength;
      if (count > max) throw new Error("파일이 너무 큽니다.");
      controller.enqueue(chunk);
    } }));
    form = await new Request(request.url, { method: "POST", headers: request.headers, body: bounded, duplex: "half" } as RequestInit & { duplex: string }).formData();
  } catch { return Response.json({ error: "파일 크기와 형식을 확인하고 다시 올려 주세요." }, { status: 400 }); }
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "파일을 선택해 주세요." }, { status: 400 });
  const versionLabel = String(form.get("version") ?? "").trim();
  const description = String(form.get("description") ?? "").trim();
  if (versionLabel.length > 60 || description.length > 1000) return Response.json({ error: "버전은 60자, 설명은 1,000자까지 입력해 주세요." }, { status: 400 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  let metadata: ReturnType<typeof inspectAttachment>;
  try { metadata = inspectAttachment(file.name, bytes, kind); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "파일을 확인해 주세요." }, { status: 400 }); }
  const id = randomUUID();
  let stored = false;
  try {
    await writeAttachmentFile(id, bytes); stored = true;
    await db.insert(projectFiles).values({ id, spaceId: access.space.id, noteId: null, kind, ...metadata, versionLabel, description, uploadedBy: access.userId });
    return Response.json({ id, url: `/api/attachments/${id}`, ...metadata }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch {
    if (stored) await removeAttachmentFile(id).catch(() => {});
    return Response.json({ error: "파일을 저장하지 못했어요. 잠시 후 다시 시도해 주세요." }, { status: 503 });
  }
}

export async function downloadAttachment(_request: Request, id: string) {
  const missing = () => new Response("접근할 수 없습니다.", { status: 404, headers: { "Cache-Control": "no-store" } });
  if (!attachmentIdPattern.test(id)) return missing();
  await requireUser();
  const [file] = await db.select().from(projectFiles).where(and(eq(projectFiles.id, id), eq(projectFiles.kind, "package"))).limit(1);
  if (!file) return missing();
  await requireSpaceMember(file.spaceId);
  let bytes: Buffer;
  try { bytes = await readAttachmentFile(id); } catch { return missing(); }
  if (bytes.length !== file.size) return missing();
  const headers = new Headers({ "Content-Type": file.mime, "Content-Length": String(bytes.length), "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "Content-Security-Policy": "default-src 'none'; sandbox", "Content-Disposition": `${file.kind === "image" ? "inline" : "attachment"}; filename="download"; filename*=UTF-8''${encodeURIComponent(file.name).replaceAll("'", "%27")}` });
  return new Response(new Uint8Array(bytes), { headers });
}
