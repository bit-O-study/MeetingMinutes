-- 파일 본문은 서버 디스크에만 저장한다. DB에는 현재 연결 주소만 기록한다.
create table if not exists public.storage_endpoints (
  id text primary key check (id = 'primary'),
  endpoint text not null,
  heartbeat timestamptz not null default now()
);
alter table public.storage_endpoints enable row level security;
revoke all on public.storage_endpoints from public, anon, authenticated;
