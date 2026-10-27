-- Daily closes of the Lima stock exchange from the SMV public registry (scripts/fetch-smv-precios.js)
-- and the daily news sentiment counted from Laya's classification (scripts/sentimiento-diario.js).
-- Only the service role reads and writes them (RLS on, no policies).

create table if not exists public.cotizaciones_smv (
  nemonico text not null,
  fecha date not null,
  cierre numeric not null,
  apertura numeric,
  maximo numeric,
  minimo numeric,
  monto numeric,
  fin_de_mes boolean not null default false,
  primary key (nemonico, fecha)
);
create index if not exists cotizaciones_smv_mes on public.cotizaciones_smv (nemonico, fecha) where fin_de_mes;
alter table public.cotizaciones_smv enable row level security;

create table if not exists public.sentimiento_diario (
  fecha date not null,
  clave text not null,          -- nemónico (ALICORC1) or "tema:<tema de Laya>"
  positivas integer not null default 0,
  negativas integer not null default 0,
  neutras integer not null default 0,
  primary key (fecha, clave)
);
alter table public.sentimiento_diario enable row level security;
