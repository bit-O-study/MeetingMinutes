create table if not exists public.file_reviews (
  file_id uuid primary key references public.project_files(id) on delete cascade,
  status text not null check(status in ('pending','reviewed','hold')) default 'pending',
  note text not null default '' check(length(note)<=1000),
  reviewer_email text not null,
  updated_at timestamptz not null default now()
);
alter table public.file_reviews enable row level security;
revoke all on public.file_reviews from public, anon, authenticated;
