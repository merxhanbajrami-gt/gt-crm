-- GT / OS — team members (assignable owners)
-- The deal-owner / task-assignee dropdowns used to derive their list from
-- distinct deals.owner_code, which (a) included people who have since left and
-- (b) missed anyone without a deal yet. This gives us one canonical, editable
-- list of who can be assigned work. Seeded from the current deal owners.

create table if not exists public.team_members (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  code       text unique,          -- rep initials; links to deals.owner_code
  email      text,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- seed from whoever currently owns deals (one row per code)
insert into public.team_members (name, code)
select distinct on (owner_code) owner_name, owner_code
from public.deals
where owner_code is not null and owner_name is not null
order by owner_code, owner_name
on conflict (code) do nothing;

-- ---------- RLS: everyone reads; admins manage ----------
alter table public.team_members enable row level security;

drop policy if exists team_members_select on public.team_members;
create policy team_members_select on public.team_members for select to authenticated
  using (true);

drop policy if exists team_members_write on public.team_members;
create policy team_members_write on public.team_members for all to authenticated
  using (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');

grant select, insert, update, delete on public.team_members to authenticated;
