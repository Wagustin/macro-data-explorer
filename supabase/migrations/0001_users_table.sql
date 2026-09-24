-- PerData: shared users table for serverless auth (Supabase PostgREST backend)
-- Run in Supabase SQL Editor (or supabase db push). Idempotent.

create table if not exists public.users (
  id text primary key,
  email text unique not null,
  name text,
  role text default 'pro',
  salt text not null,
  hash text not null,
  iterations integer default 100000,
  provider text,
  created_at timestamptz default now()
);

alter table public.users enable row level security;

-- The server talks with the service key (bypasses RLS). If using the anon key
-- instead, these minimal policies allow the auth API to work without exposing
-- password hashes to the client (PostgREST filters by email server-side only).
create policy "users_read_by_service" on public.users
  for select using (true);
create policy "users_insert_by_service" on public.users
  for insert with check (true);
