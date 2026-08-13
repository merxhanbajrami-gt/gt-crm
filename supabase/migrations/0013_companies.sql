-- GT / OS — Companies module + HubSpot notes import scaffolding
-- Oleksandr (Aug 2026): companies become first-class records so a company page
-- can show every deal and contact we have with them over time (multiple deals
-- per company is the norm). Also preps the actions table so the HubSpot notes
-- export can be imported idempotently and attached to deals/contacts/companies.

-- ---------- companies ----------
create table if not exists public.companies (
  id            uuid primary key default gen_random_uuid(),
  legacy_id     bigint unique,        -- HubSpot Record ID (join key for re-imports)
  name          text not null,
  owner_code    text,
  owner_name    text,
  phone         text,
  city          text,
  country       text,
  industry      text,
  last_activity text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists companies_name_idx on public.companies (name);

drop trigger if exists companies_set_updated_at on public.companies;
create trigger companies_set_updated_at before update on public.companies
  for each row execute function public.set_updated_at();

-- Shared reference data, like the team ideas board: every signed-in user can
-- read and maintain the company book. Deal visibility stays governed by the
-- deals policies.
alter table public.companies enable row level security;

drop policy if exists companies_select on public.companies;
create policy companies_select on public.companies for select to authenticated
  using (true);

drop policy if exists companies_write on public.companies;
create policy companies_write on public.companies for all to authenticated
  using (true) with check (true);

grant select, insert, update, delete on public.companies to authenticated;

-- ---------- links ----------
-- set null (not cascade): companies get merged/deleted during data cleanup,
-- and that must never take deals, contacts, or their notes down with it.
alter table public.deals
  add column if not exists company_id uuid references public.companies (id) on delete set null;
alter table public.contacts
  add column if not exists company_id uuid references public.companies (id) on delete set null;

create index if not exists deals_company_id_idx    on public.deals (company_id);
create index if not exists contacts_company_id_idx on public.contacts (company_id);

-- Notes can live on a contact or a company, not just a deal — HubSpot has all
-- three. legacy_id (the HubSpot note id) makes the notes import re-runnable.
alter table public.actions
  add column if not exists contact_id uuid references public.contacts (id) on delete set null,
  add column if not exists company_id uuid references public.companies (id) on delete set null,
  add column if not exists legacy_id bigint unique;

create index if not exists actions_contact_id_idx on public.actions (contact_id);
create index if not exists actions_company_id_idx on public.actions (company_id);

-- ---------- actions visibility ----------
-- Imported HubSpot notes carry the original author's owner_code, so the 0008
-- policy (manager / owner / assignee) would hide them from everyone else. A
-- note should be readable by whoever can see the record it sits on: the
-- deal's owner, the contact's owner, or — for notes attached only to a
-- company — any signed-in user (the company book is shared).
drop policy if exists actions_select on public.actions;
create policy actions_select on public.actions for select to authenticated
  using (
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
  );

-- ---------- companies list view ----------
-- One row per company with its deal/contact counts, for the Companies tab.
-- security_invoker keeps caller RLS in force (a rep counts the deals they see).
create or replace view public.v_companies
with (security_invoker = true) as
select
  c.*,
  (select count(*) from public.deals d    where d.company_id  = c.id) as deal_count,
  (select count(*) from public.contacts t where t.company_id  = c.id) as contact_count
from public.companies c;

grant select on public.v_companies to authenticated;
