-- D1 Indices for PerData
-- Run with: wrangler d1 execute perdata-db --file=d1/indices.sql

create index if not exists idx_forecasts_symbol_horizon_model on forecasts (symbol, horizon, model);
create index if not exists idx_interpretaciones_symbol on interpretaciones (symbol);
