import { attachmentResponse } from "@/lib/attachment-response";
import { downloadAttachment } from "@/lib/attachments";
export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; return attachmentResponse(() => downloadAttachment(request, id));
}
