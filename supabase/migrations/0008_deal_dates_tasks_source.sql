-- GT / OS — deal dates, tasks, and lead-source reporting
-- Backs the July 2026 feedback batch:
--   #3 editable "Date of first touch" + "Close date" on a deal
--   #5 real tasks (objective, due date, assignee) living in the actions table
--   #2 lead-source reporting on the scorecard (the deals.source column already exists)

-- ---------- deals: explicit first-touch / close dates ----------
-- These are user-editable and independent of the derived touch cadence, so a
-- rep can correct when a lead was actually first worked or closed.
alter table public.deals
  add column if not exists first_touch_date date,
  add column if not exists close_date       date;

-- ---------- actions: tasks ----------
-- Tasks reuse the actions table with kind = 'task':
--   note      -> the task objective
--   due_date  -> when it is due
--   owner_code / owner_id -> the assignee (rep it is assigned to)
--   done      -> completed
-- created_by records who raised the task (distinct from the assignee), which
-- the deferred email-notification work will use.
alter table public.actions
  add column if not exists created_by uuid references auth.users (id);

-- ---------- actions RLS: scope by owner_code like deals ----------
-- Previously an action was only visible to its owner_id (creator) or a manager.
-- A task assigned to a rep sets owner_code = their rep_code but may have a null
-- owner_id, so broaden select/write to match owner_code = current_rep_code().
-- Reps whose own logged touches set owner_code = their code are unaffected.
drop policy if exists actions_select on public.actions;
create policy actions_select on public.actions for select to authenticated
  using (
    public.is_manager()
    or owner_id = (select auth.uid())
    or owner_code = public.current_rep_code()
  );

drop policy if exists actions_write on public.actions;
create policy actions_write on public.actions for all to authenticated
  using (
    public.is_manager()
    or owner_id = (select auth.uid())
    or owner_code = public.current_rep_code()
  )
  with check (
    public.is_manager()
    or owner_id = (select auth.uid())
    or owner_code = public.current_rep_code()
  );

-- ---------- scorecard: leads by source ----------
-- Count of deals grouped by lead source, so the scorecard can show which
-- sources produce the most leads. security_invoker keeps caller RLS in force.
create or replace view public.v_deals_by_source
with (security_invoker = true) as
  select coalesce(nullif(source, ''), 'Unknown') as source,
         count(*) as count
  from public.deals
  group by 1
  order by count desc;

grant select on public.v_deals_by_source to authenticated;
