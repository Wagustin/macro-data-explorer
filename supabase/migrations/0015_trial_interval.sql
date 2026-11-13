-- PerData: intervalo (mes o año) del plan que se cobra después de la prueba gratuita.
-- Lo escribe el webhook de Stripe cuando la suscripción está en prueba, para mostrar
-- el precio correcto en la cuenta. Idempotente: se puede repetir sin efecto extra.
-- Debe aplicarse a mano en el SQL Editor de Supabase (o con `supabase db push`).
alter table public.users add column if not exists trial_interval text;
