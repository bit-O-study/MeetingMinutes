import { sql } from "./db";

export async function storageEndpoint(): Promise<string | null> {
  try {
    const [row] = await sql`select endpoint from storage_endpoints where id = 'primary' and heartbeat > now() - interval '45 seconds'`;
    if (typeof row?.endpoint !== "string") return null;
    const url = new URL(row.endpoint);
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    return url.origin;
  } catch { return null; }
}
