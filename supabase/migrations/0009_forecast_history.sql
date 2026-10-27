-- Immutable monthly snapshots used to measure matured forecast accuracy.
create table if not exists public.forecast_history (
  symbol text not null,
  horizon integer not null,
  run_date date not null,
  last_close numeric not null,
  p10 numeric not null,
  p50 numeric not null,
  p90 numeric not null,
  primary key (symbol, horizon, run_date)
);

alter table public.forecast_history enable row level security;
