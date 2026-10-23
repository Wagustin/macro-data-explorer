-- PerData: Supabase Auth integration & automatic profile sync
-- Run in Supabase SQL Editor (or supabase db push). Idempotent.
-- DO NOT EXECUTE AUTOMATICALLY (as per migration protocol).

-- 1. Function to handle new user signup from Supabase Auth
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_plan text := 'free';
  v_name text;
begin
  -- Agustín (venturasaldanaa@gmail.com) always retains Pro plan
  if lower(new.email) = 'venturasaldanaa@gmail.com' then
    v_plan := 'pro';
  elsif (new.raw_app_meta_data->>'plan') is not null then
    v_plan := new.raw_app_meta_data->>'plan';
  elsif (new.raw_user_meta_data->>'plan') is not null then
    v_plan := new.raw_user_meta_data->>'plan';
  end if;

  v_name := coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1));

  insert into public.users (id, email, name, role, plan, created_at, updated_at)
  values (
    new.id::text,
    lower(new.email),
    v_name,
    'user',
    v_plan,
    coalesce(new.created_at, now()),
    now()
  )
  on conflict (email) do update set
    id = excluded.id,
    name = coalesce(excluded.name, public.users.name),
    plan = case
      when lower(public.users.email) = 'venturasaldanaa@gmail.com' then 'pro'
      when public.users.plan = 'pro' then 'pro'
      else excluded.plan
    end,
    updated_at = now();

  return new;
end;
$$;

-- 2. Trigger on auth.users
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- 3. Trigger on auth.users update
create or replace function public.handle_update_auth_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.users
  set
    email = lower(new.email),
    name = coalesce(new.raw_user_meta_data->>'name', public.users.name),
    plan = case
      when lower(new.email) = 'venturasaldanaa@gmail.com' then 'pro'
      when (new.raw_app_meta_data->>'plan') is not null then new.raw_app_meta_data->>'plan'
      when (new.raw_user_meta_data->>'plan') is not null then new.raw_user_meta_data->>'plan'
      else public.users.plan
    end,
    updated_at = now()
  where id = new.id::text or email = lower(new.email);

  return new;
end;
$$;

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
  after update on auth.users
  for each row execute function public.handle_update_auth_user();
