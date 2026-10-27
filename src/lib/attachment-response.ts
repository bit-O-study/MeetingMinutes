import { UnauthenticatedError } from "./auth";

export async function attachmentResponse(action: () => Promise<Response>): Promise<Response> {
  try { return await action(); }
  catch (error) {
    if (error instanceof UnauthenticatedError) return Response.json({ error: "로그인 후 다시 시도해 주세요." }, { status: 401, headers: { "Cache-Control": "no-store" } });
    throw error;
  }
}
