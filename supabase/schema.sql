create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  name text,
  role text not null default 'user' check (role in ('user', 'tattoo_artist', 'studio', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.credits_wallet (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'manual' check (provider in ('manual', 'mercadopago', 'stripe', 'pix_manual', 'asaas', 'openpix')),
  provider_payment_id text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'refunded', 'canceled')),
  amount numeric(12,2) not null default 0,
  currency text not null default 'BRL',
  credits integer not null default 0 check (credits >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tattoo_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references auth.users(id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'processing', 'completed', 'failed', 'refunded')),
  generation_type text not null default 'concept' check (generation_type in ('concept', 'tattoo_image', 'mockup', 'stencil', 'full_package')),
  tattoo_name text,
  archetype text,
  style text,
  form_data jsonb not null default '{}'::jsonb,
  symbolic_reading jsonb not null default '{}'::jsonb,
  prompt_image text,
  prompt_mockup text,
  prompt_stencil text,
  prompt text,
  reading jsonb not null default '{}'::jsonb,
  image_url text,
  mockup_url text,
  stencil_url text,
  provider text,
  model text,
  credits_used integer not null default 0 check (credits_used >= 0),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('purchase', 'usage', 'refund', 'bonus', 'admin_adjustment')),
  amount integer not null,
  balance_before integer not null,
  balance_after integer not null,
  description text,
  generation_id uuid null references public.tattoo_generations(id) on delete set null,
  payment_id uuid null references public.payments(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.tattoo_drafts (
  id uuid primary key default gen_random_uuid(),
  client_id text,
  user_id uuid null references auth.users(id) on delete cascade,
  user_name text,
  profile_gender text,
  title text not null default 'Rascunho sem nome',
  answers jsonb not null default '{}'::jsonb,
  reading jsonb not null default '{}'::jsonb,
  active_index integer not null default 0,
  completion integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tattoo_generations
  add column if not exists user_id uuid,
  add column if not exists status text default 'draft',
  add column if not exists generation_type text default 'concept',
  add column if not exists tattoo_name text,
  add column if not exists archetype text,
  add column if not exists style text,
  add column if not exists form_data jsonb default '{}'::jsonb,
  add column if not exists symbolic_reading jsonb default '{}'::jsonb,
  add column if not exists prompt_image text,
  add column if not exists prompt_mockup text,
  add column if not exists prompt_stencil text,
  add column if not exists prompt text,
  add column if not exists reading jsonb default '{}'::jsonb,
  add column if not exists image_url text,
  add column if not exists mockup_url text,
  add column if not exists stencil_url text,
  add column if not exists provider text,
  add column if not exists model text,
  add column if not exists credits_used integer default 0,
  add column if not exists error_message text,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

alter table public.tattoo_drafts
  add column if not exists client_id text,
  add column if not exists user_id uuid,
  add column if not exists user_name text,
  add column if not exists profile_gender text,
  add column if not exists title text default 'Rascunho sem nome',
  add column if not exists answers jsonb default '{}'::jsonb,
  add column if not exists reading jsonb default '{}'::jsonb,
  add column if not exists active_index integer default 0,
  add column if not exists completion integer default 0,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

alter table public.tattoo_drafts
  alter column client_id drop not null,
  alter column user_id drop not null;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists credits_wallet_set_updated_at on public.credits_wallet;
create trigger credits_wallet_set_updated_at
  before update on public.credits_wallet
  for each row execute function public.set_updated_at();

drop trigger if exists payments_set_updated_at on public.payments;
create trigger payments_set_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

drop trigger if exists tattoo_generations_set_updated_at on public.tattoo_generations;
create trigger tattoo_generations_set_updated_at
  before update on public.tattoo_generations
  for each row execute function public.set_updated_at();

drop trigger if exists tattoo_drafts_set_updated_at on public.tattoo_drafts;
create trigger tattoo_drafts_set_updated_at
  before update on public.tattoo_drafts
  for each row execute function public.set_updated_at();

create index if not exists profiles_role_idx on public.profiles (role);
create index if not exists credits_wallet_user_idx on public.credits_wallet (user_id);
create index if not exists credit_transactions_user_created_idx on public.credit_transactions (user_id, created_at desc);
create index if not exists payments_user_created_idx on public.payments (user_id, created_at desc);
create index if not exists tattoo_generations_user_created_idx on public.tattoo_generations (user_id, created_at desc);
create index if not exists tattoo_generations_status_idx on public.tattoo_generations (status);
create index if not exists tattoo_drafts_user_updated_idx on public.tattoo_drafts (user_id, updated_at desc);
create index if not exists tattoo_drafts_updated_at_idx on public.tattoo_drafts (updated_at desc);

insert into storage.buckets (id, name, public)
values ('tattoo-generations', 'tattoo-generations', true)
on conflict (id) do update set public = excluded.public;

alter table public.profiles enable row level security;
alter table public.credits_wallet enable row level security;
alter table public.credit_transactions enable row level security;
alter table public.payments enable row level security;
alter table public.tattoo_generations enable row level security;
alter table public.tattoo_drafts enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (auth.uid() = id);

drop policy if exists profiles_update_own on public.profiles;

drop policy if exists credits_wallet_select_own on public.credits_wallet;
create policy credits_wallet_select_own on public.credits_wallet
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists credit_transactions_select_own on public.credit_transactions;
create policy credit_transactions_select_own on public.credit_transactions
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists payments_select_own on public.payments;
create policy payments_select_own on public.payments
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists tattoo_generations_select_own on public.tattoo_generations;
create policy tattoo_generations_select_own on public.tattoo_generations
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists tattoo_generations_insert_own on public.tattoo_generations;
create policy tattoo_generations_insert_own on public.tattoo_generations
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists tattoo_drafts_select_own on public.tattoo_drafts;
create policy tattoo_drafts_select_own on public.tattoo_drafts
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists tattoo_drafts_insert_own on public.tattoo_drafts;
create policy tattoo_drafts_insert_own on public.tattoo_drafts
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists tattoo_drafts_update_own on public.tattoo_drafts;
create policy tattoo_drafts_update_own on public.tattoo_drafts
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists tattoo_drafts_delete_own on public.tattoo_drafts;
create policy tattoo_drafts_delete_own on public.tattoo_drafts
  for delete to authenticated
  using (auth.uid() = user_id);

drop policy if exists tattoo_generation_assets_public on storage.objects;
create policy tattoo_generation_assets_public on storage.objects
  for select to public
  using (bucket_id = 'tattoo-generations');

grant usage on schema public to anon, authenticated, service_role;

revoke select, insert, update, delete on public.profiles from anon;
revoke select, insert, update, delete on public.credits_wallet from anon;
revoke select, insert, update, delete on public.credit_transactions from anon;
revoke select, insert, update, delete on public.payments from anon;
revoke select, insert, update, delete on public.tattoo_drafts from anon;
revoke select, insert, update, delete on public.tattoo_generations from anon;

grant select, update on public.profiles to authenticated, service_role;
grant select on public.credits_wallet to authenticated;
grant select on public.credit_transactions to authenticated;
grant select on public.payments to authenticated;
grant select, insert, update, delete on public.tattoo_drafts to authenticated, service_role;
grant select, insert on public.tattoo_generations to authenticated, service_role;
grant all on public.profiles to service_role;
grant all on public.credits_wallet to service_role;
grant all on public.credit_transactions to service_role;
grant all on public.payments to service_role;
grant all on public.tattoo_generations to service_role;
