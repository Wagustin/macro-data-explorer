-- PerData: prueba gratuita de 7 días del plan Boletín, una por tarjeta.
-- La ejecuta el dueño en el SQL Editor de Supabase. Idempotente. No ejecutarla desde la API.
alter table public.users add column if not exists trial_usado boolean not null default false, add column if not exists trial_hasta timestamptz;

create table if not exists public.trial_tarjetas (
  fingerprint text primary key,
  user_id uuid not null,
  creado timestamptz not null default now()
);

alter table public.trial_tarjetas enable row level security;
-- Sin policies a propósito: anon y authenticated no leen ni escriben; la API usa el service role.
