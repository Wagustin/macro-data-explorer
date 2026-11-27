-- PerData: registro diario por destinatario para evitar envíos repetidos del boletín
-- si falla un lote intermedio o el commit de data/boletin-last.json en GitHub Actions.
-- Debe aplicarse una vez en el SQL Editor de Supabase; si aún no existe,
-- scripts/boletin.js sigue protegido por la cabecera Idempotency-Key de Resend.

create table if not exists public.boletin_envios (
  fecha   date not null,
  email   text not null,
  enviado timestamptz not null default now(),
  primary key (fecha, email)
);

alter table public.boletin_envios enable row level security;
revoke all on table public.boletin_envios from anon, authenticated;
