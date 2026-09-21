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

/**
 * 풀러(Supavisor) **세션 모드**에 붙는다. 세션 모드는 클라이언트 하나가 서버 연결
 * 하나를 통째로 쥐고, 이 프로젝트의 상한은 15다. 넘기면 접속 자체가 거절된다.
 *
 *   XX000 (EMAXCONNSESSION) max clients reached in session mode
 *     - max clients are limited to pool_size: 15
 *
 * 그래서 인스턴스마다 넉넉히 잡으면 안 된다. 배포에서는 함수 인스턴스가 여럿이고,
 * 공동 편집 라우트는 연결이 오래 살아서 인스턴스가 쉽게 쌓인다. 10이면 둘만 떠도
 * 바닥난다 — 실제로 로컬에서 `next start` 하나와 개발 서버 하나로 재현됐다.
 *
 * `idle_timeout`이 특히 중요하다. 세션 모드에서는 **놀고 있는 연결도 슬롯을
 * 하나 차지**하므로, 돌려주지 않으면 상한까지 그대로 쌓인다.
 *
 * 더 늘려야 하면 풀러를 트랜잭션 모드(:6543)로 옮기는 편이 맞다. 거기서는
 * 서버 연결을 여러 클라이언트가 나눠 쓴다. `prepare: false`는 이미 그쪽 전제다.
 */
const MAX_CONNECTIONS = Number(process.env.DATABASE_POOL_MAX ?? 3);

const sql =
  globalThis.__mmSql ??
  postgres(connectionString, {
    max: process.env.NODE_ENV === "production" ? MAX_CONNECTIONS : 1,
    // 세션 모드의 슬롯을 오래 쥐고 있지 않도록 노는 연결은 돌려준다. 초 단위.
    idle_timeout: 20,
    // Supavisor 풀러를 거치므로 prepared statement를 쓰지 않는다.
    prepare: false,
    ssl: "require",
  });

if (process.env.NODE_ENV !== "production") globalThis.__mmSql = sql;

export const db = drizzle(sql, { schema });
export { schema, sql };
