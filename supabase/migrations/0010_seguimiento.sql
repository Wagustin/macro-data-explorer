-- PerData: empresas que sigue cada usuario y sus umbrales de alerta.
-- La ejecuta el dueño en el SQL Editor de Supabase. Solo el service role entra aquí.
create table if not exists public.seguimiento (
  user_id        text not null,
  simbolo        text not null,
  alerta_arriba  numeric,
  alerta_abajo   numeric,
  creado         timestamptz not null default now(),
  primary key (user_id, simbolo)
);
create index if not exists seguimiento_user on public.seguimiento (user_id);
alter table public.seguimiento enable row level security;
-- Sin policies a propósito: anon y authenticated no leen ni escriben; la API usa el service role.
