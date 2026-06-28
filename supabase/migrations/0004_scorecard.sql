-- GT / OS — scorecard aggregations
-- Exposed as views/RPCs so the frontend reads metrics in one call. All are
-- security_invoker so the caller's RLS still applies (a rep only aggregates
-- their own book; a manager aggregates everything).

-- open cards (everything not won/lost) grouped by stage
create or replace view public.v_pipeline_by_stage
with (security_invoker = true) as
  select s.id as stage, s.name, s.color, s.sort,
         count(d.id) as count,
         coalesce(sum(d.value), 0) as value
  from public.stages s
  left join public.deals d on d.stage = s.id
  group by s.id, s.name, s.color, s.sort
  order by s.sort;

-- open cards grouped by vertical
create or replace view public.v_pipeline_by_vertical
with (security_invoker = true) as
  select coalesce(nullif(vertical, ''), 'Unassigned') as vertical,
         count(*) as count
  from public.deals
  where stage not in ('won', 'lost')
  group by 1
  order by count desc;

-- headline numbers for the scorecard
create or replace function public.scorecard_summary()
returns jsonb language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'open_cards',  (select count(*) from public.deals where stage not in ('won','lost')),
    'won',         (select count(*) from public.deals where stage = 'won'),
    'lost',        (select count(*) from public.deals where stage = 'lost'),
    'hot',         (select count(*) from public.deals where hot and stage not in ('won','lost')),
    'in_attack',   (select count(*) from public.deals where stage = 'attack'),
    'in_close',    (select count(*) from public.deals where stage = 'close'),
    'total_contacts', (select count(*) from public.contacts)
  );
$$;

grant select on public.v_pipeline_by_stage, public.v_pipeline_by_vertical to authenticated;
grant execute on function public.scorecard_summary to authenticated;
