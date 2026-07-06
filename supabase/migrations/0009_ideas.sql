-- GT / OS — ideation board
-- A simple shared space for sales ideas we want to come back to. Cards are
-- dragged between priority columns to prioritise, and soft-deleted to a trash
-- bucket (status='trashed') so nothing is lost by accident. This is a team-wide
-- board: every signed-in user sees and edits every idea.

create table if not exists public.ideas (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  detail       text,
  priority     text not null default 'medium'
                 check (priority in ('high', 'medium', 'low')),
  sort         double precision not null default 0,  -- order within a column (drag)
  suggested_by text,                                 -- free text: who the idea came from (e.g. "John")
  author_id    uuid references auth.users (id),      -- who added it to the board
  author_name  text,
  status       text not null default 'active'
                 check (status in ('active', 'trashed')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists ideas_status_priority_idx
  on public.ideas (status, priority, sort);

-- reuse the shared updated_at trigger function from 0001
drop trigger if exists ideas_set_updated_at on public.ideas;
create trigger ideas_set_updated_at before update on public.ideas
  for each row execute function public.set_updated_at();

-- ---------- RLS: shared team board, any signed-in user has full access ----------
alter table public.ideas enable row level security;

drop policy if exists ideas_select on public.ideas;
create policy ideas_select on public.ideas for select to authenticated
  using (true);

drop policy if exists ideas_write on public.ideas;
create policy ideas_write on public.ideas for all to authenticated
  using (true) with check (true);

grant select, insert, update, delete on public.ideas to authenticated;
