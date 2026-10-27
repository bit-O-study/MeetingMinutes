// 통합 관리자와 같은 공개 Auth 설정으로 세션·관리자 RLS를 검증한다. DB 관리자 키를 공유하지 않는다.
export async function libraryAdmin(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ") || authorization.length > 8192) return null;
  const base = process.env.MOA_REVIEW_AUTH_URL ?? "https://hgfsfupazyjcrmophmzc.supabase.co";
  const apikey = process.env.MOA_REVIEW_AUTH_KEY ?? "sb_publishable_9QpBzKow2CuUP-5tUZVlCw_BfbM_PYR";
  const headers = { Authorization: authorization, apikey };
  const response = await fetch(base + "/auth/v1/user", { headers, cache: "no-store", signal: AbortSignal.timeout(10000) });
  if (!response.ok) return null;
  const user = await response.json();
  if (typeof user.id !== "string" || typeof user.email !== "string") return null;
  const admins = await fetch(base + "/rest/v1/admins?select=email&email=eq." + encodeURIComponent(user.email) + "&limit=1", { headers, cache: "no-store", signal: AbortSignal.timeout(10000) });
  if (!admins.ok) return null;
  const rows = await admins.json();
  if (!Array.isArray(rows) || !rows.some(row => row.email?.toLowerCase() === user.email.toLowerCase())) return null;
  return { id: user.id as string, email: user.email as string };
}
