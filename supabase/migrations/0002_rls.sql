-- GT / OS — Row Level Security
-- Authorization model:
--   admin   : full access to everything
--   manager : sees + edits ALL deals/contacts/actions (the Director / founder view)
--   rep     : sees + edits only rows they own (owner_code = their rep_code)
-- The role is read from the JWT claim 'user_role' (set by the custom access token
-- hook in 0003) so policies don't hit a table on every row.

-- ---------- helpers ----------
create or replace function public.current_role()
returns text language sql stable
set search_path = ''
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'user_role', ''),
    'rep'
  );
$$;

create or replace function public.is_manager()
returns boolean language sql stable
set search_path = ''
as $$
  select public.current_role() in ('admin', 'manager');
$$;

-- a rep's own initials, looked up from their profile
create or replace function public.current_rep_code()
returns text language sql stable
set search_path = ''
as $$
  select rep_code from public.profiles where id = (select auth.uid());
$$;

-- ---------- enable RLS everywhere ----------
alter table public.profiles   enable row level security;
alter table public.user_roles enable row level security;
alter table public.stages     enable row level security;
alter table public.deals      enable row level security;
alter table public.contacts   enable row level security;
alter table public.actions    enable row level security;

-- ---------- profiles ----------
drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.is_manager());

drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles for update to authenticated
  using (id = (select auth.uid()) or public.is_manager())
  with check (id = (select auth.uid()) or public.is_manager());

-- ---------- user_roles (managers/admins manage; everyone reads own) ----------
drop policy if exists roles_read on public.user_roles;
create policy roles_read on public.user_roles for select to authenticated
  using (user_id = (select auth.uid()) or public.is_manager());

drop policy if exists roles_write on public.user_roles;
create policy roles_write on public.user_roles for all to authenticated
  using (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');

-- ---------- stages: readable by all signed-in users ----------
drop policy if exists stages_read on public.stages;
create policy stages_read on public.stages for select to authenticated using (true);

-- ---------- deals ----------
drop policy if exists deals_select on public.deals;
create policy deals_select on public.deals for select to authenticated
  using (public.is_manager() or owner_code = public.current_rep_code());

drop policy if exists deals_insert on public.deals;
create policy deals_insert on public.deals for insert to authenticated
  with check (public.is_manager() or owner_code = public.current_rep_code());

drop policy if exists deals_update on public.deals;
create policy deals_update on public.deals for update to authenticated
  using (public.is_manager() or owner_code = public.current_rep_code())
  with check (public.is_manager() or owner_code = public.current_rep_code());

drop policy if exists deals_delete on public.deals;
create policy deals_delete on public.deals for delete to authenticated
  using (public.is_manager());

-- ---------- contacts (same shape as deals) ----------
drop policy if exists contacts_select on public.contacts;
create policy contacts_select on public.contacts for select to authenticated
  using (public.is_manager() or owner_code = public.current_rep_code());

drop policy if exists contacts_write on public.contacts;
create policy contacts_write on public.contacts for all to authenticated
  using (public.is_manager() or owner_code = public.current_rep_code())
  with check (public.is_manager() or owner_code = public.current_rep_code());

-- ---------- actions: you work your own list; managers see all ----------
drop policy if exists actions_select on public.actions;
create policy actions_select on public.actions for select to authenticated
  using (public.is_manager() or owner_id = (select auth.uid()));

drop policy if exists actions_write on public.actions;
create policy actions_write on public.actions for all to authenticated
  using (public.is_manager() or owner_id = (select auth.uid()))
  with check (public.is_manager() or owner_id = (select auth.uid()));
