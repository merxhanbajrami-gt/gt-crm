-- GT / OS — Sep 2026 batch (Oleksandr)
--  1) First touch is mandatory: default today, not null. Apply
--     supabase/seed/dates-backfill-sep2026.sql FIRST — it fills the 500
--     migrated deals from HubSpot's Create Date; this file only handles what
--     is still blank after that (in-app deals → their creation day).
--  2) Companies carry a client status: derived from won deals (client since =
--     first won deal's close date), with a manual override for Ex-Client and
--     for pre-CRM clients. Exposed on v_companies for the list/filter/sort.
--  3) Stage history table, filled by trigger on every stage change, so the
--     scorecard can answer "how many leads reached Attack / Close" and
--     stage-to-stage conversion. Backfilled from the in-app "Moved X → Y"
--     activity rows; HubSpot-era moves are unknown.
--  4) Winning a deal flips its client type New Client / Ex-Client → Existing
--     Client, and clears an Ex-Client override on the company.
--  5) scorecard_range(from, to): every date-ranged number in one RPC.

begin;

-- 1) first touch is mandatory --------------------------------------------------

update public.deals
set first_touch_date = created_at::date
where first_touch_date is null;

alter table public.deals
  alter column first_touch_date set default current_date,
  alter column first_touch_date set not null;

-- 2) companies: client status ----------------------------------------------------

alter table public.companies add column if not exists client_type text;

comment on column public.companies.client_type is
  'Manual override of the derived client status (New Client / Existing Client / Ex-Client). Null = derive from the company''s deals.';

-- Won-deal facts for one company, regardless of who is asking. Whether a
-- company is a client is shared knowledge; the deals themselves stay
-- rep-scoped, which is why this is security definer.
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
$$;

grant execute on function public.company_client_facts(uuid) to authenticated;

-- client_status precedence:
--   manual override → won a deal (Existing Client) → a deal marked Existing
--   Client (sold to them before the CRM) → any deal at all (New Client, i.e. a
--   prospect) → null (no deals)
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
      when f.won_count > 0    then 'Existing Client'
      when f.has_existing_type then 'Existing Client'
      when f.has_deals        then 'New Client'
    end
  ) as client_status
from public.companies c
cross join lateral public.company_client_facts(c.id) f;

grant select on public.v_companies to authenticated;

-- 3) stage history -----------------------------------------------------------------

create table if not exists public.deal_stage_events (
  id         uuid primary key default gen_random_uuid(),
  deal_id    uuid not null references public.deals (id) on delete cascade,
  from_stage text references public.stages (id),       -- null = created in to_stage
  to_stage   text not null references public.stages (id),
  changed_at timestamptz not null default now(),
  changed_by uuid,
  rep_code   text
);

create index if not exists deal_stage_events_deal_idx
  on public.deal_stage_events (deal_id, changed_at);

alter table public.deal_stage_events enable row level security;

-- readable wherever the deal is (deals RLS applies inside the subquery)
drop policy if exists deal_stage_events_select on public.deal_stage_events;
create policy deal_stage_events_select on public.deal_stage_events
  for select to authenticated
  using (exists (select 1 from public.deals d where d.id = deal_stage_events.deal_id));

grant select on public.deal_stage_events to authenticated;
-- no write grant: rows come only from the trigger below

create or replace function public.deals_log_stage_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.deal_stage_events (deal_id, from_stage, to_stage, changed_by, rep_code)
    values (new.id, null, new.stage, auth.uid(), public.current_rep_code());
  elsif new.stage is distinct from old.stage then
    insert into public.deal_stage_events (deal_id, from_stage, to_stage, changed_by, rep_code)
    values (new.id, old.stage, new.stage, auth.uid(), public.current_rep_code());
  end if;
  return null;
end;
$$;

drop trigger if exists deals_log_stage_event on public.deals;
create trigger deals_log_stage_event
  after insert or update of stage on public.deals
  for each row
  execute function public.deals_log_stage_event();

-- backfill from the activity feed ("Moved Pursue → Attack", "Moved Attack → Lost · reason")
insert into public.deal_stage_events (deal_id, from_stage, to_stage, changed_at, changed_by, rep_code)
select a.deal_id, sf.id, st.id, a.created_at, a.owner_id, a.owner_code
from public.actions a
cross join lateral (select regexp_match(a.note, '^Moved (.+?) → (.+?)(?: ·.*)?$') as m) r
join public.stages sf on sf.name = r.m[1]
join public.stages st on st.name = r.m[2]
where a.kind = 'stage'
  and a.deal_id is not null
  and not exists (
    select 1 from public.deal_stage_events e
    where e.deal_id = a.deal_id and e.changed_at = a.created_at
  );

-- 4) a won deal makes them a client -------------------------------------------------

-- one BEFORE UPDATE hook owns all stage-change side effects (0014, 0016, here)
create or replace function public.deals_touch_on_stage_change()
returns trigger
language plpgsql
as $$
begin
  if new.stage is distinct from old.stage then
    new.last_touched_at = now();
    if new.stage in ('won', 'lost') and old.stage not in ('won', 'lost') then
      new.close_date = coalesce(new.close_date, current_date);
    elsif old.stage in ('won', 'lost') and new.stage not in ('won', 'lost') then
      -- back into the working pipeline: it isn't closed any more
      new.close_date = null;
      new.lost_reason = null;
    end if;
    if new.stage = 'won' then
      new.lost_reason = null;
      -- signed → they are a client now (Oleksandr, Sep 2026)
      if new.client_type in ('New Client', 'Ex-Client') then
        new.client_type = 'Existing Client';
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- same rule for a deal created straight into Won
create or replace function public.deals_won_on_insert()
returns trigger
language plpgsql
as $$
begin
  if new.stage = 'won' then
    new.close_date = coalesce(new.close_date, current_date);
    if new.client_type in ('New Client', 'Ex-Client') then
      new.client_type = 'Existing Client';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists deals_won_on_insert on public.deals;
create trigger deals_won_on_insert
  before insert on public.deals
  for each row
  execute function public.deals_won_on_insert();

-- a won deal linked to a company retires that company's Ex-Client / New Client
-- override, so the derived status (Existing Client) shows again
create or replace function public.deals_won_marks_company_client()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.stage = 'won' and new.company_id is not null then
    update public.companies
    set client_type = null
    where id = new.company_id
      and client_type in ('Ex-Client', 'New Client');
  end if;
  return null;
end;
$$;

drop trigger if exists deals_won_marks_company_client on public.deals;
create trigger deals_won_marks_company_client
  after insert or update of stage, company_id on public.deals
  for each row
  execute function public.deals_won_marks_company_client();

-- 5) date-ranged scorecard ------------------------------------------------------------
-- Cohort = deals whose first touch falls in the range ("leads added"). Reach =
-- the furthest stage each cohort deal ever got to: its current stage (lost
-- counts as nothing), or any stage it was moved to/from in the history table.
-- Closed-in-range numbers key on close_date. security invoker: reps see their
-- book, managers the team's.
create or replace function public.scorecard_range(p_from date, p_to date)
returns jsonb
language sql
stable
set search_path = ''
as $$
with cohort as (
  select d.id, d.stage, d.source, d.client_type, d.value, s.sort as stage_sort
  from public.deals d
  join public.stages s on s.id = d.stage
  where d.first_touch_date between p_from and p_to
),
reach as (
  select c.id,
    greatest(
      case when c.stage = 'lost' then 0 else c.stage_sort end,
      coalesce((select max(s2.sort)
                from public.deal_stage_events e
                join public.stages s2 on s2.id = e.to_stage
                where e.deal_id = c.id and e.to_stage <> 'lost'), 0),
      coalesce((select max(s3.sort)
                from public.deal_stage_events e
                join public.stages s3 on s3.id = e.from_stage
                where e.deal_id = c.id and e.from_stage <> 'lost'), 0)
    ) as max_sort
  from cohort c
),
closed as (
  select d.stage, d.value, d.lost_reason
  from public.deals d
  where d.stage in ('won', 'lost')
    and d.close_date between p_from and p_to
),
clients as (
  select company_id, min(close_date) as since
  from public.deals
  where stage = 'won' and company_id is not null
  group by company_id
)
select jsonb_build_object(
  'leads',              (select count(*) from cohort),
  'leads_open',         (select count(*) from cohort where stage not in ('won', 'lost')),
  'leads_won',          (select count(*) from cohort where stage = 'won'),
  'leads_lost',         (select count(*) from cohort where stage = 'lost'),
  'reached_pursue',     (select count(*) from reach where max_sort >= 2),
  'reached_attack',     (select count(*) from reach where max_sort >= 3),
  'reached_close',      (select count(*) from reach where max_sort >= 4),
  'reached_won',        (select count(*) from reach where max_sort >= 5),
  'won_in_range',       (select count(*) from closed where stage = 'won'),
  'won_value_in_range', (select coalesce(sum(value), 0) from closed where stage = 'won'),
  'lost_in_range',      (select count(*) from closed where stage = 'lost'),
  'new_clients',        (select count(*) from clients where since between p_from and p_to),
  'by_source', (
    select coalesce(jsonb_agg(jsonb_build_object('label', label, 'count', n) order by n desc, label), '[]'::jsonb)
    from (select coalesce(nullif(source, ''), 'Unknown') as label, count(*) as n from cohort group by 1) t
  ),
  'by_client_type', (
    select coalesce(jsonb_agg(jsonb_build_object('label', label, 'count', n) order by n desc, label), '[]'::jsonb)
    from (select coalesce(nullif(client_type, ''), 'Unassigned') as label, count(*) as n from cohort group by 1) t
  ),
  'lost_by_reason', (
    select coalesce(jsonb_agg(jsonb_build_object('label', label, 'count', n) order by n desc, label), '[]'::jsonb)
    from (select coalesce(nullif(lost_reason, ''), 'Unspecified') as label, count(*) as n
          from closed where stage = 'lost' group by 1) t
  )
)
$$;

grant execute on function public.scorecard_range(date, date) to authenticated;

commit;
