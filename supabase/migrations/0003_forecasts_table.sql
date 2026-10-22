-- PerData: pre-computed batch forecasts (TimesFM 2.5 / Engine v3)
-- Run in the Supabase SQL Editor (or `supabase db push`). Idempotent.

create table if not exists public.forecasts (
  symbol text not null,
  horizon int not null,
  model text not null,
  run_at timestamptz not null default now(),
  last_close numeric not null,
  p10 numeric not null,
  p25 numeric not null,
  p50 numeric not null,
  p75 numeric not null,
  p90 numeric not null,
  path jsonb not null,
  primary key (symbol, horizon, model)
);

-- RLS: closed to anon and authenticated roles. Read and write exclusively
-- via backend with the service role key so paywalled long horizons remain protected.
alter table public.forecasts enable row level security;
revoke all on public.forecasts from anon, authenticated;

create index if not exists idx_forecasts_lookup
  on public.forecasts (symbol, horizon, model, run_at desc);
