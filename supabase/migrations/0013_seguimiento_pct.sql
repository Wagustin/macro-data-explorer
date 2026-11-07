-- PerData: avisos por porcentaje, precio de referencia y bienvenida del seguimiento.
-- La ejecuta el dueño en el SQL Editor de Supabase (DDL). Idempotente.

alter table public.seguimiento
  add column if not exists precio_base         numeric,
  add column if not exists alerta_pct_arriba   numeric,
  add column if not exists alerta_pct_abajo    numeric,
  add column if not exists alerta_diaria       boolean not null default true;

alter table public.alertas_enviadas drop constraint if exists alertas_enviadas_tipo_check;
alter table public.alertas_enviadas
  add constraint alertas_enviadas_tipo_check
  check (tipo in ('arriba','abajo','pct_arriba','pct_abajo'));

alter table public.users add column if not exists bienvenida_seguimiento timestamptz;

create index if not exists seguimiento_simbolo_idx on public.seguimiento (simbolo);
