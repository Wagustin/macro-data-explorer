create table if not exists public.etiquetas_noticias (
  id text primary key,
  fecha timestamptz not null default now(),
  titulo text not null,
  fuente text,
  relevante boolean not null,
  relevancia text,
  tema text,
  sentimiento text,
  empresas text[] not null default '{}',
  modelo text,
  creado_en timestamptz not null default now()
);

create index if not exists etiquetas_noticias_fecha_desc on public.etiquetas_noticias (fecha desc);
create index if not exists etiquetas_noticias_relevante on public.etiquetas_noticias (relevante);

alter table public.etiquetas_noticias enable row level security;
revoke all on public.etiquetas_noticias from anon, authenticated;
