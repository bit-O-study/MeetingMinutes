import { randomUUID } from "node:crypto";
import { requireSpaceMember } from "@/lib/access";
import { attachmentResponse } from "@/lib/attachment-response";
import { storageEndpoint } from "@/lib/storage-endpoint";
import { signStorageTicket, verifyStorageTicket } from "@/lib/storage-ticket";
export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ spaceId: string }> }) {
  return attachmentResponse(async () => {
    const { spaceId } = await params;
    const access = await requireSpaceMember(spaceId);
    if (request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ error: "자료실에서 다시 시도해 주세요." }, { status: 403 });
    if (Number(request.headers.get("content-length")) > 12000) return new Response(null, { status: 413 });
    const text = await request.text();
    if (text.length > 12000) return new Response(null, { status: 413 });
    let input;
    try { input = JSON.parse(text); } catch { return new Response(null, { status: 400 }); }
    const endpoint = await storageEndpoint();
    if (!endpoint) return Response.json({ error: "파일 서버 연결을 확인 중이에요. 잠시 후 다시 시도해 주세요." }, { status: 503 });
    try {
      const token = signStorageTicket({ action: "upload", id: randomUUID(), spaceId, userId: access.userId, expires: Date.now() + 600000, name: input.name, size: input.size, version: input.version ?? "", description: input.description ?? "" });
      verifyStorageTicket(token);
      return Response.json({ url: endpoint + "/files", token }, { headers: { "Cache-Control": "no-store" } });
    } catch { return Response.json({ error: "파일 형식과 크기(64MB 이하), 버전·설명을 확인해 주세요." }, { status: 400 }); }
  });
}
