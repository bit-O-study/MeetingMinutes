import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

declare global {
  // 개발 중 HMR로 커넥션이 쌓이는 것을 막는다.
  var __mmSql: ReturnType<typeof postgres> | undefined;
}

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL이 설정되지 않았습니다. .env.example을 참고해 .env.local을 만드세요.");
}

const sql =
  globalThis.__mmSql ??
  postgres(connectionString, {
    max: process.env.NODE_ENV === "production" ? 10 : 1,
    // Supavisor 풀러를 거치므로 prepared statement를 쓰지 않는다.
    prepare: false,
    ssl: "require",
  });

if (process.env.NODE_ENV !== "production") globalThis.__mmSql = sql;

export const db = drizzle(sql, { schema });
export { schema, sql };
