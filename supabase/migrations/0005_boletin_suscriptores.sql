-- PerData: subscribers of the daily newsletter (double opt-in).
-- Run once in the Supabase SQL Editor. Only the service role reads or writes this table.

create table if not exists public.boletin_suscriptores (
  email        text primary key check (email = lower(email) and position('@' in email) > 1),
  estado       text not null default 'pendiente' check (estado in ('pendiente', 'activo', 'baja')),
  token        text not null unique,               -- random, used in the confirm and unsubscribe links
  origen       text,                               -- page where they signed up
  creado       timestamptz not null default now(),
  confirmado   timestamptz,
  baja         timestamptz
);

create index if not exists boletin_suscriptores_estado on public.boletin_suscriptores (estado);

alter table public.boletin_suscriptores enable row level security;
-- No policies: anon and authenticated users get no access; the API uses the service role.
