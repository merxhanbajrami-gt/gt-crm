-- GT / OS — core schema
-- Lightweight internal CRM. Deals, contacts, actions, pipeline stages, and the
-- people who use it. Owners are sales reps identified by an initials "rep_code"
-- (e.g. JO, OK, VS) carried over from the HubSpot export.

create extension if not exists "pgcrypto";

-- ---------- roles ----------
do $$ begin
  create type public.app_role as enum ('admin', 'manager', 'rep');
exception when duplicate_object then null; end $$;

-- ---------- profiles (one row per auth user) ----------
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  full_name  text,
  rep_code   text unique,            -- initials linking a user to their deals
  created_at timestamptz not null default now()
);

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role    public.app_role not null default 'rep'
);

-- ---------- pipeline stages (reference data) ----------
create table if not exists public.stages (
  id    text primary key,
  name  text not null,
  verb  text,
  descr text,
  color text,
  sort  int not null default 0
);

insert into public.stages (id, name, verb, descr, color, sort) values
  ('connection', 'Connection', 'Keep warm',        'A good contact, not yet a deal. Light touches only. Do not pitch.', '#7B7AE6', 1),
  ('pursue',     'Pursue',     'Get the meeting',   'They know GT. The job is one scoped conversation on the calendar.', '#2F4BF5', 2),
  ('attack',     'Attack',     'Push now',          'Live opportunity. Daily momentum. Remove every blocker yourself.',  '#B45309', 3),
  ('close',      'Close',      'Get the signature', 'Proposal is out. One open question stands between you and ink.',    '#0A0A0A', 4),
  ('won',        'Won',        'Deliver and expand','Signed. Protect the relationship and mine the expansion.',          '#16A34A', 5),
  ('lost',       'Lost',       'Closed lost',       'Deal is dead. Kept for analysis, not for working.',                 '#DC2626', 6)
on conflict (id) do nothing;

-- ---------- deals ----------
create table if not exists public.deals (
  id            uuid primary key default gen_random_uuid(),
  legacy_id     int unique,                       -- id from the HubSpot export
  company       text,
  dealname      text,
  contact_name  text,
  title         text,
  email         text,
  phone         text,
  stage         text not null default 'connection' references public.stages (id),
  value         numeric not null default 0,
  days_in_stage int not null default 0,
  owner_code    text,                             -- rep initials (links to profiles.rep_code)
  owner_name    text,
  owner_id      uuid references auth.users (id),  -- resolved auth user (nullable until mapped)
  vertical      text,
  source        text,
  hot           boolean not null default false,
  last_activity text,
  n_contacts    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists deals_stage_idx      on public.deals (stage);
create index if not exists deals_owner_code_idx  on public.deals (owner_code);
create index if not exists deals_owner_id_idx    on public.deals (owner_id);

-- ---------- contacts ----------
create table if not exists public.contacts (
  id         uuid primary key default gen_random_uuid(),
  legacy_id  int unique,
  name       text,
  title      text,
  email      text,
  stage      text,
  owner_code text,
  owner_id   uuid references auth.users (id),
  dealname   text,
  hot        boolean not null default false,
  vertical   text,
  created_at timestamptz not null default now()
);

create index if not exists contacts_owner_code_idx on public.contacts (owner_code);

-- ---------- actions (the weekly touch list) ----------
create table if not exists public.actions (
  id         uuid primary key default gen_random_uuid(),
  deal_id    uuid references public.deals (id) on delete cascade,
  owner_id   uuid references auth.users (id),
  owner_code text,
  kind       text not null default 'touch',  -- touch | call | email | meeting | note
  note       text,
  due_date   date,
  done       boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists actions_owner_idx on public.actions (owner_id);
create index if not exists actions_due_idx   on public.actions (due_date) where not done;

-- keep updated_at fresh on deals
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists deals_set_updated_at on public.deals;
create trigger deals_set_updated_at before update on public.deals
  for each row execute function public.set_updated_at();
