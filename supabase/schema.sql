create table if not exists public.tattoo_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null,
  tattoo_name text,
  archetype text,
  style text,
  prompt text,
  reading jsonb not null default '{}'::jsonb,
  image_url text,
  created_at timestamptz not null default now()
);

alter table public.tattoo_generations
  add column if not exists user_id uuid,
  add column if not exists tattoo_name text,
  add column if not exists archetype text,
  add column if not exists style text,
  add column if not exists prompt text,
  add column if not exists reading jsonb default '{}'::jsonb,
  add column if not exists image_url text,
  add column if not exists created_at timestamptz default now();

create index if not exists tattoo_generations_user_created_idx
  on public.tattoo_generations (user_id, created_at desc);

create index if not exists tattoo_generations_created_at_idx
  on public.tattoo_generations (created_at desc);

create table if not exists public.tattoo_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null,
  title text not null default 'Rascunho sem nome',
  answers jsonb not null default '{}'::jsonb,
  reading jsonb not null default '{}'::jsonb,
  active_index integer not null default 0,
  completion integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tattoo_drafts
  add column if not exists user_id uuid,
  add column if not exists title text default 'Rascunho sem nome',
  add column if not exists answers jsonb default '{}'::jsonb,
  add column if not exists reading jsonb default '{}'::jsonb,
  add column if not exists active_index integer default 0,
  add column if not exists completion integer default 0,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

alter table public.tattoo_drafts
  alter column user_id drop not null;

create index if not exists tattoo_drafts_user_updated_idx
  on public.tattoo_drafts (user_id, updated_at desc);

create index if not exists tattoo_drafts_updated_at_idx
  on public.tattoo_drafts (updated_at desc);

alter table public.tattoo_generations enable row level security;
alter table public.tattoo_drafts enable row level security;

drop policy if exists tattoo_generations_select_own on public.tattoo_generations;
create policy tattoo_generations_select_own
  on public.tattoo_generations
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists tattoo_generations_insert_own on public.tattoo_generations;
create policy tattoo_generations_insert_own
  on public.tattoo_generations
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists tattoo_drafts_select_own on public.tattoo_drafts;
create policy tattoo_drafts_select_own
  on public.tattoo_drafts
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists tattoo_drafts_insert_own on public.tattoo_drafts;
create policy tattoo_drafts_insert_own
  on public.tattoo_drafts
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists tattoo_drafts_update_own on public.tattoo_drafts;
create policy tattoo_drafts_update_own
  on public.tattoo_drafts
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists tattoo_drafts_delete_own on public.tattoo_drafts;
create policy tattoo_drafts_delete_own
  on public.tattoo_drafts
  for delete
  to authenticated
  using (auth.uid() = user_id);

grant usage on schema public to anon, authenticated, service_role;

revoke select, insert, update, delete on public.tattoo_drafts from anon;
revoke select, insert, update, delete on public.tattoo_generations from anon;

grant select, insert, update, delete on public.tattoo_drafts to authenticated, service_role;
grant select, insert on public.tattoo_generations to authenticated, service_role;
