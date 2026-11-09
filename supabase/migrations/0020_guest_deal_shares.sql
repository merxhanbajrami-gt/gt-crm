-- GT / OS — guest sign-ins that see only the deals shared with them
-- Oleksandr / Nikita (Nov 2026): Joshua gets the CRM, but only for the leads
-- we pick. An admin or manager ticks "Visible to <guest>" on a deal. The guest
-- then sees that deal, the contacts linked to it, and its company. Pipeline,
-- Lost, Contacts, Companies and their searches all read through RLS, so the
-- same rule holds everywhere.
--
-- On a shared deal a guest can edit fields, move the stage, and add notes,
-- tasks and contacts. The deal's linked contacts and its company are editable
-- too. A guest cannot create or delete deals, delete contacts or companies,
-- change an owner, or see the ideas board.
--
-- A new enum value can't be used in the transaction that adds it, so give a
-- user the role after this file is applied:
--   update public.user_roles set role = 'guest' where user_id = '<uuid>';

begin;

-- ---------- role ----------
alter type public.app_role add value if not exists 'guest';

-- text comparison, so this compiles before the new enum value is committed
create or replace function public.is_guest()
returns boolean language sql stable
set search_path = ''
as $$
  select public.current_role() = 'guest';
$$;

-- A guest owns nothing. With no rep code, every owner_code clause in the
-- existing policies is false for a guest, even if its profile carries a code
-- (profiles_self_update lets a user write their own rep_code).
create or replace function public.current_rep_code()
returns text language sql stable
set search_path = ''
as $$
  select rep_code from public.profiles
  where id = (select auth.uid())
    and not public.is_guest();
$$;

-- ---------- shares ----------
create table if not exists public.deal_shares (
  deal_id    uuid not null references public.deals (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  granted_by uuid default auth.uid() references auth.users (id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (deal_id, user_id)
);

create index if not exists deal_shares_user_id_idx on public.deal_shares (user_id);

alter table public.deal_shares enable row level security;

-- managers see and manage every share; a guest reads its own
drop policy if exists deal_shares_select on public.deal_shares;
create policy deal_shares_select on public.deal_shares for select to authenticated
  using (public.is_manager() or user_id = (select auth.uid()));

drop policy if exists deal_shares_write on public.deal_shares;
create policy deal_shares_write on public.deal_shares for all to authenticated
  using (public.is_manager())
  with check (public.is_manager());

grant select, insert, delete on public.deal_shares to authenticated;

-- ---------- what is shared with the caller ----------
-- security definer: these run inside the policies of deals, contacts,
-- companies and actions, and must not re-enter those policies.

create or replace function public.deal_shared_with_me(p_deal uuid)
returns boolean language sql stable
security definer set search_path = ''
as $$
  select exists (
    select 1 from public.deal_shares s
    where s.deal_id = p_deal
      and s.user_id = (select auth.uid())
  );
$$;

-- a contact is shared when it is linked to a shared deal
create or replace function public.contact_shared_with_me(p_contact uuid)
returns boolean language sql stable
security definer set search_path = ''
as $$
  select exists (
    select 1 from public.contacts t
    join public.deal_shares s on s.deal_id = t.deal_id
    where t.id = p_contact
      and s.user_id = (select auth.uid())
  );
$$;

-- a company is shared when a shared deal sits on it
create or replace function public.company_shared_with_me(p_company uuid)
returns boolean language sql stable
security definer set search_path = ''
as $$
  select exists (
    select 1 from public.deal_shares s
    join public.deals d on d.id = s.deal_id
    where d.company_id = p_company
      and s.user_id = (select auth.uid())
  );
$$;

-- A note or task is shared when its deal is, when its contact is, or, for a
-- company-level note (no deal, no contact), when its company is. A note on a
-- hidden deal stays hidden even when it also carries a shared company.
create or replace function public.action_shared_with_me(
  p_deal uuid, p_contact uuid, p_company uuid
)
returns boolean language sql stable
security definer set search_path = ''
as $$
  select public.deal_shared_with_me(p_deal)
      or public.contact_shared_with_me(p_contact)
      or (p_deal is null and p_contact is null
          and public.company_shared_with_me(p_company));
$$;

-- ---------- deals ----------
-- The existing policies give a guest nothing (not a manager, no rep code).
-- These add the shared deals. Insert and delete stay closed to guests.
drop policy if exists deals_guest_select on public.deals;
create policy deals_guest_select on public.deals for select to authenticated
  using ((select public.is_guest()) and public.deal_shared_with_me(id));

drop policy if exists deals_guest_update on public.deals;
create policy deals_guest_update on public.deals for update to authenticated
  using ((select public.is_guest()) and public.deal_shared_with_me(id))
  with check ((select public.is_guest()) and public.deal_shared_with_me(id));

-- ---------- contacts ----------
-- the contacts linked to a shared deal; a guest can add more to that deal,
-- but not delete any
drop policy if exists contacts_guest_select on public.contacts;
create policy contacts_guest_select on public.contacts for select to authenticated
  using ((select public.is_guest()) and public.deal_shared_with_me(deal_id));

drop policy if exists contacts_guest_insert on public.contacts;
create policy contacts_guest_insert on public.contacts for insert to authenticated
  with check ((select public.is_guest()) and public.deal_shared_with_me(deal_id));

drop policy if exists contacts_guest_update on public.contacts;
create policy contacts_guest_update on public.contacts for update to authenticated
  using ((select public.is_guest()) and public.deal_shared_with_me(deal_id))
  with check ((select public.is_guest()) and public.deal_shared_with_me(deal_id));

-- ---------- companies ----------
-- The company book stays shared with the team (0013), but not with guests.
-- A guest sees and edits the companies of its shared deals, and cannot create
-- or delete one.
drop policy if exists companies_select on public.companies;
create policy companies_select on public.companies for select to authenticated
  using (not (select public.is_guest()));

drop policy if exists companies_write on public.companies;
create policy companies_write on public.companies for all to authenticated
  using (not (select public.is_guest()))
  with check (not (select public.is_guest()));

drop policy if exists companies_guest_select on public.companies;
create policy companies_guest_select on public.companies for select to authenticated
  using ((select public.is_guest()) and public.company_shared_with_me(id));

drop policy if exists companies_guest_update on public.companies;
create policy companies_guest_update on public.companies for update to authenticated
  using ((select public.is_guest()) and public.company_shared_with_me(id))
  with check ((select public.is_guest()) and public.company_shared_with_me(id));

-- ---------- actions (notes, tasks, stage moves) ----------
-- The 0013 policy, unchanged for the team. Guests are taken out of it: its
-- owner_id clause would show a guest its own notes on a deal that is no
-- longer shared, and its company-note clause shows every company's notes.
drop policy if exists actions_select on public.actions;
create policy actions_select on public.actions for select to authenticated
  using (
    not (select public.is_guest())
    and (
      public.is_manager()
      or owner_id = (select auth.uid())
      or owner_code = public.current_rep_code()
      or exists (select 1 from public.deals d
                 where d.id = actions.deal_id
                   and d.owner_code = public.current_rep_code())
      or exists (select 1 from public.contacts t
                 where t.id = actions.contact_id
                   and t.owner_code = public.current_rep_code())
      or (actions.deal_id is null and actions.contact_id is null
          and actions.company_id is not null)
    )
  );

-- the 0008 policy, minus guests: owner_id alone would let a guest write a
-- note against any deal
drop policy if exists actions_write on public.actions;
create policy actions_write on public.actions for all to authenticated
  using (
    not (select public.is_guest())
    and (public.is_manager()
         or owner_id = (select auth.uid())
         or owner_code = public.current_rep_code())
  )
  with check (
    not (select public.is_guest())
    and (public.is_manager()
         or owner_id = (select auth.uid())
         or owner_code = public.current_rep_code())
  );

-- a guest reads everything on its shared records, and writes, edits and
-- deletes only its own notes and tasks there
drop policy if exists actions_guest_select on public.actions;
create policy actions_guest_select on public.actions for select to authenticated
  using (
    (select public.is_guest())
    and public.action_shared_with_me(deal_id, contact_id, company_id)
  );

drop policy if exists actions_guest_insert on public.actions;
create policy actions_guest_insert on public.actions for insert to authenticated
  with check (
    (select public.is_guest())
    and (owner_id = (select auth.uid()) or created_by = (select auth.uid()))
    and public.action_shared_with_me(deal_id, contact_id, company_id)
  );

drop policy if exists actions_guest_update on public.actions;
create policy actions_guest_update on public.actions for update to authenticated
  using (
    (select public.is_guest())
    and (owner_id = (select auth.uid()) or created_by = (select auth.uid()))
    and public.action_shared_with_me(deal_id, contact_id, company_id)
  )
  with check (
    (select public.is_guest())
    and (owner_id = (select auth.uid()) or created_by = (select auth.uid()))
    and public.action_shared_with_me(deal_id, contact_id, company_id)
  );

drop policy if exists actions_guest_delete on public.actions;
create policy actions_guest_delete on public.actions for delete to authenticated
  using (
    (select public.is_guest())
    and (owner_id = (select auth.uid()) or created_by = (select auth.uid()))
    and public.action_shared_with_me(deal_id, contact_id, company_id)
  );

-- ---------- ideas ----------
-- the team's board (0009); guests don't get it
drop policy if exists ideas_select on public.ideas;
create policy ideas_select on public.ideas for select to authenticated
  using (not (select public.is_guest()));

drop policy if exists ideas_write on public.ideas;
create policy ideas_write on public.ideas for all to authenticated
  using (not (select public.is_guest()))
  with check (not (select public.is_guest()));

-- ---------- guest edits ----------
-- RLS can't compare old and new values, so a trigger stops a guest from
-- changing an owner, or from linking a record to a company it can't see
-- (that would make the company visible to it).
create or replace function public.guest_update_guard()
returns trigger language plpgsql
set search_path = ''
as $$
declare
  o jsonb := to_jsonb(old);
  n jsonb := to_jsonb(new);
begin
  if not public.is_guest() then
    return new;
  end if;
  if n -> 'owner_code' is distinct from o -> 'owner_code'
     or n -> 'owner_name' is distinct from o -> 'owner_name'
     or n -> 'owner_id' is distinct from o -> 'owner_id' then
    raise exception 'Guests cannot change the owner'
      using errcode = '42501';
  end if;
  if n -> 'company_id' is distinct from o -> 'company_id'
     and n ->> 'company_id' is not null
     and not public.company_shared_with_me((n ->> 'company_id')::uuid) then
    raise exception 'Guests can only link a company they can see'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists deals_guest_guard on public.deals;
create trigger deals_guest_guard
  before update on public.deals
  for each row
  execute function public.guest_update_guard();

drop trigger if exists contacts_guest_guard on public.contacts;
create trigger contacts_guest_guard
  before update on public.contacts
  for each row
  execute function public.guest_update_guard();

drop trigger if exists companies_guest_guard on public.companies;
create trigger companies_guest_guard
  before update on public.companies
  for each row
  execute function public.guest_update_guard();

-- ---------- client status ----------
-- The 0017 function reads every deal of a company, for any caller. For a
-- guest it counts only the shared deals, so the won count and "client since"
-- don't reveal deals it can't see.
create or replace function public.company_client_facts(p_company uuid)
returns table (
  won_count         bigint,
  client_since      date,
  has_deals         boolean,
  has_existing_type boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*) filter (where stage = 'won'),
         min(close_date) filter (where stage = 'won'),
         count(*) > 0,
         coalesce(bool_or(client_type = 'Existing Client'), false)
  from public.deals
  where company_id = p_company
    and (not public.is_guest() or public.deal_shared_with_me(id))
$$;

commit;
