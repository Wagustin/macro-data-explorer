-- PerData: quita el acceso de los roles anon y authenticated a las tablas internas.
-- La API, los scripts y los workers leen y escriben con la service key, que no usa estos permisos,
-- así que ningún cliente del navegador necesita leerlas. Idempotente: se puede repetir sin efecto extra.
-- Debe aplicarse a mano en el SQL Editor de Supabase (o con `supabase db push`).

revoke all on table public.boletin_suscriptores from anon, authenticated;
revoke all on table public.seguimiento from anon, authenticated;
revoke all on table public.trial_tarjetas from anon, authenticated;
revoke all on table public.alertas_enviadas from anon, authenticated;
revoke all on table public.forecast_history from anon, authenticated;
revoke all on table public.cotizaciones_smv from anon, authenticated;
revoke all on table public.sentimiento_diario from anon, authenticated;
