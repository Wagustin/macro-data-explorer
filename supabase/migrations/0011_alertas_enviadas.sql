-- PerData: avisos ya enviados, para no repetir el mismo correo.
-- Una fila por (usuario, símbolo, tipo, nivel). Se borra cuando el precio se aleja del nivel,
-- y así el siguiente cruce vuelve a avisar.
create table if not exists public.alertas_enviadas (
  user_id  text not null,
  simbolo  text not null,
  tipo     text not null check (tipo in ('arriba','abajo')),
  nivel    numeric not null,
  precio   numeric not null,
  enviado  timestamptz not null default now(),
  primary key (user_id, simbolo, tipo, nivel)
);
alter table public.alertas_enviadas enable row level security;
