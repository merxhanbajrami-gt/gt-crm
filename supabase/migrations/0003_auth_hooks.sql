-- GT / OS — auth hooks
-- 1. Restrict sign-up/sign-in to GT-HQ email domains (internal-only app).
-- 2. Inject the user's role into the JWT as the 'user_role' claim so RLS is cheap.
-- 3. Auto-create a profile row + default 'rep' role for each new user.
--
-- After applying, enable both hooks in the Supabase dashboard:
--   Authentication -> Hooks -> "Before user created"  = hook_restrict_signup_by_email_domain
--   Authentication -> Hooks -> "Custom access token"   = custom_access_token_hook

-- ---------- allowed sign-in domains ----------
create table if not exists public.signup_email_domains (
  domain text primary key
);
insert into public.signup_email_domains (domain) values ('gt-hq.com')
on conflict (domain) do nothing;

-- ---------- 1. domain allowlist (Before User Created hook) ----------
create or replace function public.hook_restrict_signup_by_email_domain(event jsonb)
returns jsonb language plpgsql
security definer set search_path = ''
as $$
declare
  email_domain text;
begin
  email_domain := lower(split_part(event -> 'user' ->> 'email', '@', 2));
  if not exists (
    select 1 from public.signup_email_domains where domain = email_domain
  ) then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'Only GT-HQ accounts may access GT / OS.'
      )
    );
  end if;
  return '{}'::jsonb;
end;
$$;

-- ---------- 2. role claim (Custom Access Token hook) ----------
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb language plpgsql
stable security definer set search_path = ''
as $$
declare
  claims jsonb;
  user_role public.app_role;
begin
  select role into user_role
  from public.user_roles
  where user_id = (event ->> 'user_id')::uuid;

  claims := event -> 'claims';
  claims := jsonb_set(claims, '{user_role}',
    coalesce(to_jsonb(user_role::text), '"rep"'::jsonb));

  return jsonb_set(event, '{claims}', claims);
end;
$$;

-- grant the auth admin role access to the hook functions + tables they read
grant usage on schema public to supabase_auth_admin;
grant execute on function public.hook_restrict_signup_by_email_domain to supabase_auth_admin;
grant execute on function public.custom_access_token_hook to supabase_auth_admin;
grant select on public.signup_email_domains to supabase_auth_admin;
grant select on public.user_roles to supabase_auth_admin;

-- ---------- 3. provision profile + default role on signup ----------
create or replace function public.handle_new_user()
returns trigger language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')
  )
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role)
  values (new.id, 'rep')
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
