import { attachmentResponse } from "@/lib/attachment-response";
import { uploadAttachment } from "@/lib/attachments";
export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ spaceId: string }> }) {
  const { spaceId } = await params; return attachmentResponse(() => uploadAttachment(request, spaceId, "package"));
}
