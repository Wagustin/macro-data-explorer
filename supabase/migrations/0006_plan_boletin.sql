-- PerData: allow the "boletin" plan (US$2/month) in users.plan.
alter table public.users drop constraint if exists users_plan_check;
alter table public.users add constraint users_plan_check check (plan in ('free', 'boletin', 'pro'));
