-- Make role resolution robust: read the role from the JWT claim when present
-- (fast path, set by the custom access token hook), but fall back to the
-- user_roles table so authorization still works even if that hook isn't enabled.
-- SECURITY DEFINER lets the internal user_roles lookup bypass RLS, which also
-- prevents policy recursion (is_manager -> current_role -> user_roles policy).

create or replace function public.current_role()
returns text language sql stable
security definer set search_path = ''
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'user_role', ''),
    (select role::text from public.user_roles where user_id = (select auth.uid())),
    'rep'
  );
$$;
