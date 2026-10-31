/**
 * postgres.js 연결 옵션. index.ts 에서 분리해 값을 테스트한다.
 *
 * 2026-10-31 장애: 운영 서버에서 자료실·통계처럼 DB 를 거치는 요청만 응답 없이 멈췄고,
 * 앱을 다시 띄우자 바로 풀렸다. 풀러·NAT 가 오래 산 연결을 조용히 끊으면 그 연결의
 * 쿼리는 끝없이 기다린다. 파일 서버 heartbeat 가 10초마다 쿼리를 보내 연결이 놀지 않으니
 * `idle_timeout` 으로는 영영 교체되지 않았다. 그래서
 *   - `max_lifetime` 으로 연결을 주기적으로 새로 맺고,
 *   - `keep_alive` 를 짧게 잡아 죽은 소켓을 빨리 알아채며,
 *   - `connect_timeout` 으로 새 연결이 매달리지 않게 한다.
 */
export function poolOptions(env: { NODE_ENV?: string; DATABASE_POOL_MAX?: string }) {
  return {
    max: env.NODE_ENV === "production" ? Number(env.DATABASE_POOL_MAX ?? 3) : 1,
    // 세션 모드의 슬롯을 오래 쥐고 있지 않도록 노는 연결은 돌려준다. 초 단위.
    idle_timeout: 20,
    // 바쁜 연결도 10분이면 새로 맺는다(조용히 끊긴 연결에 묶이지 않게). 초 단위.
    max_lifetime: 60 * 10,
    // 죽은 소켓을 TCP keepalive 로 빨리 감지한다. 초 단위.
    keep_alive: 15,
    // 새 연결이 응답 없이 매달리면 10초에 포기한다. 초 단위.
    connect_timeout: 10,
    // Supavisor 풀러를 거치므로 prepared statement를 쓰지 않는다.
    prepare: false,
    ssl: "require" as const,
  };
}
