import type postgres from "postgres";

type Sql = postgres.Sql<Record<string, never>>;

/**
 * 멈춘 연결 풀을 스스로 갈아 끼우는 postgres.js 래퍼.
 *
 * 2026-10-31 운영 서버: 풀(최대 3)의 연결이 모두 '연결됨' 상태인데 풀러(Supavisor)에서
 * 응답이 오지 않아 쿼리가 끝없이 기다렸다. DB 쪽에는 실행 중인 쿼리도 잠금도 없었고,
 * 소켓은 살아 있어 keep_alive·max_lifetime 으로는 잡히지 않았다(바쁜 연결은 교체되지 않음).
 * 앱을 다시 띄우면 풀렸다 — 그 "다시 띄우기"를 풀 단위로 자동으로 한다.
 *
 * 주기적으로 `select 1` 을 보내 제한 시간 안에 답이 없으면 새 풀을 만들어 바꾸고,
 * 옛 풀은 즉시 닫아 매달린 쿼리들이 오류로 끝나게 한다(요청이 영원히 멈추는 대신 실패 응답).
 * drizzle 이 클라이언트 options 의 parsers/serializers 를 고쳐 쓰므로 새 풀에도 옮겨 준다.
 */
export function resilientSql(
  create: () => Sql,
  { probeEveryMs = 15_000, probeTimeoutMs = 10_000, log = (m: string) => console.warn(m) } = {},
) {
  let current = create();
  let probing = false;

  async function probe(): Promise<boolean> {
    if (probing) return true;
    probing = true;
    const target = current;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        target`select 1`,
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("probe timeout")), probeTimeoutMs); }),
      ]);
      return true;
    } catch (error) {
      if (target === current) {
        const next = create();
        Object.assign(next.options.parsers, target.options.parsers);
        Object.assign(next.options.serializers, target.options.serializers);
        current = next;
        log(`DB 연결 풀이 응답하지 않아 새로 만들었다: ${(error as Error).message}`);
        void target.end({ timeout: 0 }).catch(() => {});
      }
      return false;
    } finally {
      clearTimeout(timer);
      probing = false;
    }
  }

  const interval = setInterval(() => void probe(), probeEveryMs);
  interval.unref?.();

  // 태그 호출(sql`...`)과 메서드(sql.unsafe·sql.begin·sql.end …) 모두 지금의 풀로 보낸다.
  const sql = new Proxy(function () {} as unknown as Sql, {
    apply: (_target, _this, args: unknown[]) => (current as unknown as (...a: unknown[]) => unknown)(...args),
    get: (_target, prop) => {
      const value = (current as unknown as Record<PropertyKey, unknown>)[prop];
      return typeof value === "function" ? value.bind(current) : value;
    },
  });

  return { sql, probe, stop: () => clearInterval(interval) };
}
