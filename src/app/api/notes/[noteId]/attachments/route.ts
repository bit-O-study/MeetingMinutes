import { randomUUID } from "node:crypto";
import { requireNoteAccess } from "@/lib/access";
import { attachmentResponse } from "@/lib/attachment-response";
import { storageEndpoint } from "@/lib/storage-endpoint";
import { signStorageTicket, verifyStorageTicket } from "@/lib/storage-ticket";
export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ noteId: string }> }) {
  return attachmentResponse(async () => {
    const { noteId } = await params;
    const access = await requireNoteAccess(noteId);
    if (request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ error: "메모에서 다시 시도해 주세요." }, { status: 403 });
    if (Number(request.headers.get("content-length")) > 2000) return new Response(null, { status: 413 });
    const text = await request.text();
    if (text.length > 2000) return new Response(null, { status: 413 });
    const endpoint = await storageEndpoint();
    if (!endpoint) return Response.json({ error: "사진 저장소에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 503 });
    try {
      const input = JSON.parse(text);
      const token = signStorageTicket({ action: "upload", kind: "image", noteId, id: randomUUID(), spaceId: access.space.id, userId: access.userId, expires: Date.now() + 600000, name: input.name, size: input.size, version: "", description: "" });
      verifyStorageTicket(token);
      return Response.json({ url: endpoint + "/files", token }, { headers: { "Cache-Control": "no-store" } });
    } catch { return Response.json({ error: "사진은 5MB 이하 JPG, PNG, WebP 파일로 올려 주세요." }, { status: 400 }); }
  });
}
