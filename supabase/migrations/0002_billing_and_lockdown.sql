-- PerData: plan/billing columns for Stripe + close the table to anon/authenticated roles.
-- Run in the Supabase SQL Editor (or `supabase db push`). Idempotent.

alter table public.users add column if not exists plan text not null default 'free';
alter table public.users add column if not exists stripe_customer_id text;
alter table public.users add column if not exists stripe_subscription_id text;
alter table public.users add column if not exists subscription_status text;
alter table public.users add column if not exists cancel_at_period_end boolean not null default false;
alter table public.users add column if not exists current_period_end timestamptz;
alter table public.users add column if not exists updated_at timestamptz default now();

-- Before billing existed every signup got role 'pro'; nobody has paid yet.
update public.users set plan = 'free' where stripe_subscription_id is null;

do $$ begin
  alter table public.users add constraint users_plan_check check (plan in ('free', 'pro'));
exception when duplicate_object then null; end $$;

create unique index if not exists users_stripe_customer_id_key
  on public.users (stripe_customer_id) where stripe_customer_id is not null;

-- 0001 created policies that let the public anon key read every row, including
-- password hashes. The API uses the service role key, which bypasses RLS, so no
-- policies are needed at all.
drop policy if exists "users_read_by_service" on public.users;
drop policy if exists "users_insert_by_service" on public.users;
alter table public.users enable row level security;
revoke all on public.users from anon, authenticated;

-- Password reset (token stored only as a SHA-256 hash) and session revocation on password change.
alter table public.users add column if not exists reset_token_hash text;
alter table public.users add column if not exists reset_expires_at timestamptz;
alter table public.users add column if not exists password_changed_at timestamptz;
create index if not exists users_reset_token_hash_idx on public.users (reset_token_hash) where reset_token_hash is not null;
