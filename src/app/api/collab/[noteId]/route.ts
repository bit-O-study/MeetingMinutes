import { requireNoteAccess } from "@/lib/access";
import { UnauthenticatedError } from "@/lib/auth";

/** 소켓 서버도 기존 세션·스페이스 권한 검사를 반드시 거친다. */
export async function GET(_request: Request, { params }: RouteContext<"/api/collab/[noteId]">) {
  const { noteId } = await params;
  try {
    const access = await requireNoteAccess(noteId);
    return Response.json({ userId: access.userId, spaceId: access.note.spaceId }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof UnauthenticatedError) return new Response(null, { status: 401 });
    throw error;
  }
}
