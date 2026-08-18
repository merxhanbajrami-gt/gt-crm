-- GT / OS — close-date correctness + "why lost" capture (UX review, Aug 2026)
--  1) Deals closed in the app never got a close_date (the import only
--     backfilled HubSpot's). Stamp it on the stage change itself so every
--     path (drawer, board drag, SQL) is covered; reopening clears it.
--  2) deals.lost_reason: picked from a short list when marking a deal lost,
--     for the "why do we lose" analytics. Cleared when a deal reopens or wins.

begin;

alter table public.deals add column if not exists lost_reason text;

-- one BEFORE UPDATE hook owns all stage-change side effects
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
    end if;
  end if;
  return new;
end;
$$;

-- (trigger deals_touch_on_stage_change from 0014 already calls this function)

-- lost-reason breakdown for the scorecard
create or replace view public.v_lost_by_reason
with (security_invoker = true) as
  select coalesce(nullif(lost_reason, ''), 'Unspecified') as reason,
         count(*) as count
  from public.deals
  where stage = 'lost'
  group by 1
  order by count desc;

grant select on public.v_lost_by_reason to authenticated;

commit;
