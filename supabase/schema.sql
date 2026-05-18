create table if not exists public.tattoo_generations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_name text,
  profile_gender text,
  answers jsonb not null default '{}'::jsonb,
  reading jsonb not null default '{}'::jsonb,
  prompt text,
  image_url text,
  assets jsonb not null default '{}'::jsonb
);

create index if not exists tattoo_generations_created_at_idx
  on public.tattoo_generations (created_at desc);

create index if not exists tattoo_generations_user_name_idx
  on public.tattoo_generations (user_name);

create table if not exists public.tattoo_drafts (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  user_id uuid not null,
  title text not null default 'Rascunho sem nome',
  user_name text,
  profile_gender text,
  answers jsonb not null default '{}'::jsonb,
  reading jsonb not null default '{}'::jsonb,
  active_index integer not null default 0,
  completion integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tattoo_drafts
  add column if not exists user_id uuid;

create index if not exists tattoo_drafts_client_updated_idx
  on public.tattoo_drafts (client_id, updated_at desc);

create index if not exists tattoo_drafts_user_updated_idx
  on public.tattoo_drafts (user_id, updated_at desc);

create index if not exists tattoo_drafts_user_name_idx
  on public.tattoo_drafts (user_name);

alter table public.tattoo_drafts enable row level security;

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

grant usage on schema public to anon, authenticated, service_role;

revoke select, insert, update on public.tattoo_drafts from anon;
grant select, insert, update on public.tattoo_drafts to authenticated, service_role;

grant select, insert on public.tattoo_generations to anon, authenticated, service_role;
