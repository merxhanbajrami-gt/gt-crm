-- GT / OS — deal record feedback round (Aug 2026, Oleksandr)
--  1) deals.vertical never held a vertical: the June import filled it from
--     HubSpot "Deal Type" (New/Existing Business). Rename to client_type and
--     normalise the values so the UI can offer a two-option dropdown.
--     (contacts.vertical is untouched — that one holds HubSpot "Industry".)
--  2) "Quiet for" was dead: days_in_stage only ever got reset to 0 and nothing
--     incremented it. Replace with last_touched_at, kept fresh by triggers on
--     stage moves and activity inserts; the UI computes the day count live.
--  3) Stage copy now describes opportunity maturity, not meeting status.

begin;

-- 1) vertical -> client_type -------------------------------------------------

drop view if exists public.v_pipeline_by_vertical;

alter table public.deals rename column vertical to client_type;

update public.deals set client_type = 'New Client'      where client_type = 'New Business';
update public.deals set client_type = 'Existing Client' where client_type = 'Existing Business';

create or replace view public.v_pipeline_by_client_type
with (security_invoker = true) as
  select coalesce(nullif(client_type, ''), 'Unassigned') as client_type,
         count(*) as count
  from public.deals
  where stage not in ('won', 'lost')
  group by 1
  order by count desc;

grant select on public.v_pipeline_by_client_type to authenticated;

-- 2) last_touched_at ----------------------------------------------------------

alter table public.deals add column if not exists last_touched_at timestamptz;

-- backfill: HubSpot "Last Activity Date" ('YYYY-MM-DD HH:MM' text), then the
-- newest in-app action, then the row's creation time
update public.deals
set last_touched_at = left(last_activity, 16)::timestamptz
where last_touched_at is null
  and last_activity ~ '^\d{4}-\d{2}-\d{2}';

update public.deals d
set last_touched_at = greatest(coalesce(d.last_touched_at, a.latest), a.latest)
from (
  select deal_id, max(created_at) as latest
  from public.actions
  where deal_id is not null
  group by deal_id
) a
where a.deal_id = d.id;

update public.deals set last_touched_at = created_at where last_touched_at is null;

alter table public.deals
  alter column last_touched_at set not null,
  alter column last_touched_at set default now();

comment on column public.deals.days_in_stage is
  'deprecated (0014): was never incremented — use last_touched_at';

-- restaging a deal counts as touching it
create or replace function public.deals_touch_on_stage_change()
returns trigger
language plpgsql
as $$
begin
  if new.stage is distinct from old.stage then
    new.last_touched_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists deals_touch_on_stage_change on public.deals;
create trigger deals_touch_on_stage_change
  before update on public.deals
  for each row
  execute function public.deals_touch_on_stage_change();

-- any logged activity (touch / note / task / stage move) un-quiets its deal.
-- security definer: a rep can log against a deal they can see but not update.
create or replace function public.actions_touch_deal()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.deal_id is not null then
    update public.deals set last_touched_at = now() where id = new.deal_id;
  end if;
  return new;
end;
$$;

drop trigger if exists actions_touch_deal on public.actions;
create trigger actions_touch_deal
  after insert on public.actions
  for each row
  execute function public.actions_touch_deal();

-- 3) stage copy: maturity of the opportunity, not "has a meeting happened" ----

update public.stages set verb = 'Get the meeting',
  descr = 'First meeting is not booked yet. Focus on getting the conversation started.'
  where id = 'connection';
update public.stages set verb = 'Find the opportunity',
  descr = 'Meeting booked or completed. Explore needs and work towards a concrete opportunity.'
  where id = 'pursue';
update public.stages set verb = 'Drive to agreement',
  descr = 'Clear opportunity identified. Develop the solution and proposal, and actively move the deal towards an agreement.'
  where id = 'attack';
update public.stages set verb = 'Get the signature',
  descr = 'Commercial terms agreed. Finalise MSA/SOW and get the deal signed.'
  where id = 'close';
update public.stages set verb = 'Deliver and expand',
  descr = 'Deal signed. Deliver, maintain the relationship, and look for expansion.'
  where id = 'won';

commit;
