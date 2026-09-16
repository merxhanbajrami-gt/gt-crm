-- GT / OS — Commercial vs Defence business segment (Oleksandr, Sep 2026)
--
-- Defence sells differently from the rest of the book, so it needs to be
-- separable at the company level and reportable later. The rules he asked for:
--   * every company is Commercial or Defence (Commercial is the general case)
--   * a deal carries its own segment, chosen when the deal is created
--   * a Defence deal marks its company as Defence
--   * later deals for a Defence company default to Defence
--
-- Stored, not derived. Client status (0017) is derived because it follows from
-- won deals; segment is a standing fact about the account that someone asserts
-- once, so a column plus two triggers says exactly what he described.

begin;

-- ---------- columns ----------

alter table public.companies add column if not exists business_segment text;
alter table public.deals     add column if not exists business_segment text;

comment on column public.companies.business_segment is
  'Commercial (default) or Defence. Set to Defence automatically by the first Defence deal; can be set by hand on the company record.';
comment on column public.deals.business_segment is
  'Commercial or Defence. Defaults to the company''s segment at insert, else Commercial.';

-- everything on record today predates the split, so it is Commercial until
-- someone says otherwise. Oleksandr flags the Defence accounts by hand after
-- this lands; from then on the triggers keep it current.
update public.companies set business_segment = 'Commercial' where business_segment is null;
update public.deals     set business_segment = 'Commercial' where business_segment is null;

-- ---------- a new deal takes its company's segment ----------
-- BEFORE INSERT so the value is in place before NOT NULL is checked. No column
-- default on deals: a default would be indistinguishable from an explicit
-- "Commercial" and would beat the company's segment.

create or replace function public.deals_set_business_segment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.business_segment is null then
    new.business_segment := coalesce(
      (select business_segment from public.companies where id = new.company_id),
      'Commercial'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists deals_set_business_segment on public.deals;
create trigger deals_set_business_segment
  before insert on public.deals
  for each row
  execute function public.deals_set_business_segment();

-- ---------- a Defence deal marks its company ----------
-- One-way: Defence sticks. Moving a company back to Commercial is a manual
-- edit on the company record, the same as an Ex-Client override.

create or replace function public.deals_defence_marks_company()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.business_segment = 'Defence' and new.company_id is not null then
    update public.companies
    set business_segment = 'Defence'
    where id = new.company_id
      and business_segment is distinct from 'Defence';
  end if;
  return null;
end;
$$;

drop trigger if exists deals_defence_marks_company on public.deals;
create trigger deals_defence_marks_company
  after insert or update of business_segment, company_id on public.deals
  for each row
  execute function public.deals_defence_marks_company();

-- ---------- constraints ----------
-- applied after the backfill and after the insert trigger exists

alter table public.companies
  alter column business_segment set default 'Commercial',
  alter column business_segment set not null;

alter table public.deals
  alter column business_segment set not null;

alter table public.companies drop constraint if exists companies_business_segment_chk;
alter table public.companies add constraint companies_business_segment_chk
  check (business_segment in ('Commercial', 'Defence'));

alter table public.deals drop constraint if exists deals_business_segment_chk;
alter table public.deals add constraint deals_business_segment_chk
  check (business_segment in ('Commercial', 'Defence'));

-- the Companies tabs filter on this, the pipeline may later group by it
create index if not exists companies_business_segment_idx
  on public.companies (business_segment);
create index if not exists deals_business_segment_idx
  on public.deals (business_segment);

-- ---------- view ----------
-- v_companies is "select c.*", so business_segment comes through on its own.
-- Rebuilt here anyway so the definition in this file matches what is live.

drop view if exists public.v_companies;
create view public.v_companies
with (security_invoker = true) as
select
  c.*,
  (select count(*) from public.deals d    where d.company_id = c.id) as deal_count,
  (select count(*) from public.contacts t where t.company_id = c.id) as contact_count,
  f.won_count,
  f.client_since,
  coalesce(
    c.client_type,
    case
      when f.won_count > 0     then 'Existing Client'
      when f.has_existing_type then 'Existing Client'
      when f.has_deals         then 'New Client'
    end
  ) as client_status
from public.companies c
cross join lateral public.company_client_facts(c.id) f;

grant select on public.v_companies to authenticated;

commit;
