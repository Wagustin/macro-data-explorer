-- PerData: indices for real filter queries across alerts, forecast history, and newsletter.
-- Run in Supabase SQL Editor (or `supabase db push`). Idempotent.

create index if not exists alertas_enviadas_user_simbolo_idx
  on public.alertas_enviadas (user_id, simbolo);

create index if not exists forecast_history_symbol_horizon_run_date_idx
  on public.forecast_history (symbol, horizon, run_date);

create index if not exists boletin_suscriptores_token_idx
  on public.boletin_suscriptores (token);
