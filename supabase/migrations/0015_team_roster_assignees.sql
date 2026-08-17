-- GT / OS — team roster update (Oleksandr, Aug 2026) and the owner/assignee
-- split: the Owner dropdown includes the sourcing partners (Nick Eaves,
-- Chriss Tuff, Andrew Muzzelle), but tasks are only assigned to the core team.

begin;

alter table public.team_members
  add column if not exists task_assignee boolean not null default true;

comment on column public.team_members.task_assignee is
  'appears in task-assignee dropdowns; the owner dropdown is all active members';

-- joiners (codes must not clash with historical ones: NE = Nataliia Eksarova,
-- so Nick Eaves gets NIC)
insert into public.team_members (name, code, active, task_assignee) values
  ('Kate',            'KT',  true, true),
  ('Anton',           'AN',  true, true),
  ('Rocky Hinton',    'RH',  true, true),
  ('Jordan Orloff',   'JO',  true, true),
  ('Nick Eaves',      'NIC', true, false),
  ('Chriss Tuff',     'CT',  true, false),
  ('Andrew Muzzelle', 'AM',  true, false)
on conflict (code) do update
  set name = excluded.name,
      active = true,
      task_assignee = excluded.task_assignee;

-- staying on from the current roster
update public.team_members
set active = true, task_assignee = true
where code in ('NG', 'JH', 'AB', 'OK');

-- everyone else leaves the dropdowns; their codes stay on historical deals
update public.team_members
set active = false
where code not in ('NG', 'JH', 'AB', 'OK', 'KT', 'AN', 'RH', 'JO', 'NIC', 'CT', 'AM');

commit;
