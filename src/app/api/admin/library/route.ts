import { sql } from "@/lib/db";
import { libraryAdmin } from "@/lib/library-admin";
import { reviewInput, reviewStates } from "@/lib/library-review";
import { attachmentIdPattern } from "@/lib/attachment-input";
import { storageEndpoint } from "@/lib/storage-endpoint";
import { signStorageTicket } from "@/lib/storage-ticket";
export const runtime = "nodejs";
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
export async function GET(request: Request) {
  try {
    const admin = await libraryAdmin(request);
    if (!admin) return json({ error: "관리자 권한이 필요합니다." }, 403);
    const search = new URL(request.url).searchParams;
    const id = search.get("download");
    if (id) {
      if (!attachmentIdPattern.test(id)) return json({ error: "파일을 찾을 수 없습니다." }, 404);
      const [file] = await sql`select f.id,f.space_id from project_files f join spaces s on s.id=f.space_id where f.id=${id} and s.deleted_at is null`;
      if (!file) return json({ error: "파일을 찾을 수 없습니다." }, 404);
      const endpoint = await storageEndpoint();
      if (!endpoint) return json({ error: "파일 서버 연결을 확인해 주세요." }, 503);
      const ticket = signStorageTicket({ action: "download", id, spaceId: file.space_id, userId: admin.id, expires: Date.now() + 120000, review: true });
      return json({ url: endpoint + "/files?ticket=" + encodeURIComponent(ticket) });
    }
    const term = (search.get("q") ?? "").trim().slice(0, 100);
    const project = search.get("project") ?? "";
    const status = search.get("status") ?? "";
    const page = Math.min(100000, Math.max(1, Number(search.get("page")) || 1));
    if ((project && !attachmentIdPattern.test(project)) || (status && !reviewStates.includes(status as typeof reviewStates[number])) || !Number.isInteger(page)) return json({ error: "검색 조건을 확인해 주세요." }, 400);
    const pattern = "%" + term.replace(/[\\%_]/g, "\\$&") + "%";
    const files = await sql`select f.id,f.space_id as "spaceId",s.name as "projectName",f.name,f.kind,f.size,f.sha256,f.version_label as "versionLabel",f.description,f.created_at as "createdAt",u.name as "uploaderName",u.email as "uploaderEmail",coalesce(r.status,'pending') as status,coalesce(r.note,'') as "reviewNote",r.reviewer_email as "reviewerEmail",r.updated_at as "reviewedAt"
      from project_files f join spaces s on s.id=f.space_id left join users u on u.id=f.uploaded_by left join file_reviews r on r.file_id=f.id
      where s.deleted_at is null and (${project}='' or f.space_id::text=${project}) and (${status}='' or coalesce(r.status,'pending')=${status}) and (${term}='' or f.name ilike ${pattern} or s.name ilike ${pattern})
      order by f.created_at desc,f.id desc limit 26 offset ${(page-1)*25}`;
    const projects = await sql`select distinct s.id,s.name from spaces s join project_files f on f.space_id=s.id where s.deleted_at is null order by s.name`;
    const [counts] = await sql`select count(*)::int as total,count(*) filter(where coalesce(r.status,'pending')='pending')::int as pending,count(*) filter(where r.status='reviewed')::int as reviewed,count(*) filter(where r.status='hold')::int as hold from project_files f join spaces s on s.id=f.space_id left join file_reviews r on r.file_id=f.id where s.deleted_at is null`;
    return json({ files: files.slice(0,25), projects, counts, page, hasNext: files.length>25, storageReady: Boolean(await storageEndpoint()) });
  } catch { return json({ error: "자료실 연결을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요." }, 503); }
}
export async function POST(request: Request) {
  try {
    const admin = await libraryAdmin(request);
    if (!admin) return json({ error: "관리자 권한이 필요합니다." }, 403);
    if (Number(request.headers.get("content-length")) > 12000) return json({ error: "내용이 너무 깁니다." }, 413);
    const text = await request.text();
    if (text.length > 12000) return json({ error: "내용이 너무 깁니다." }, 413);
    let input;
    try { input = reviewInput(JSON.parse(text)); } catch { return json({ error: "검수 상태와 메모를 확인해 주세요." }, 400); }
    const [file] = await sql`select f.id from project_files f join spaces s on s.id=f.space_id where f.id=${input.id} and s.deleted_at is null`;
    if (!file) return json({ error: "파일을 찾을 수 없습니다." }, 404);
    await sql`insert into file_reviews(file_id,status,note,reviewer_email,updated_at) values(${input.id},${input.status},${input.note},${admin.email},now()) on conflict(file_id) do update set status=excluded.status,note=excluded.note,reviewer_email=excluded.reviewer_email,updated_at=excluded.updated_at`;
    return json({ ok: true });
  } catch { return json({ error: "검수 기록을 저장하지 못했습니다." }, 503); }
}
