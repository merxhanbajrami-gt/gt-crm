-- GT / OS — link sign-ins to their rep code (Oleksandr, Sep 2026)
--
-- Reported as "My Week → My tasks shows nothing". The cause is wider than
-- My Week: handle_new_user() (0003) creates a profile with id, email and
-- full_name and never sets rep_code, and nothing else ever did. Six of the
-- eight profiles carry rep_code = NULL.
--
-- What that breaks:
--   * every "mine" filter in the UI compares owner_code to the signed-in
--     rep_code, so a NULL matches nothing and the list comes back empty
--   * current_rep_code() (0002) drives the RLS clauses on deals and actions.
--     For an admin, is_manager() still lets everything through, so the only
--     symptom is the empty filter. For a plain rep it is worse: rows whose
--     only claim is owner_code are invisible to them.
--
-- The roster in team_members already holds the codes; it just had no email to
-- join on. So: give the roster emails, backfill the profiles from it, and make
-- the signup trigger do the lookup from now on.

begin;

-- ---------- 1. the roster gets emails to join on ----------

-- Merxhan was never on the roster, so there was no code to link him to.
-- MB is Michael Bayler's, hence MERX.
insert into public.team_members (name, code, email, active)
values ('Merxhan Bajrami', 'MERX', 'merxhan.bajrami@gt-hq.com', true)
on conflict (code) do update
  set email = excluded.email,
      name  = excluded.name,
      active = true;

update public.team_members set email = v.email
from (values
  ('OK',  'oleksandr.kicha@gt-hq.co'),
  ('JO',  'jordan.orloff@gt-hq.com'),
  ('NG',  'nikita@gt-hq.com'),
  ('KT',  'kateryna.miroshnikova@gt-hq.com'),
  ('JH',  'john.harris@gt-hq.com'),
  ('RH',  'rocky.hinton@gt-hq.com')
) as v(code, email)
where public.team_members.code = v.code
  and public.team_members.email is distinct from v.email;

-- ---------- 2. backfill the profiles ----------
-- rep_code is UNIQUE, so only fill a blank one, and only with a code no other
-- profile already holds.

update public.profiles p
set rep_code = t.code
from public.team_members t
where p.rep_code is null
  and t.email is not null
  and lower(t.email) = lower(p.email)
  and not exists (
    select 1 from public.profiles q where q.rep_code = t.code
  );

-- ---------- 3. new sign-ins get their code automatically ----------

create or replace function public.handle_new_user()
returns trigger language plpgsql
security definer set search_path = ''
as $$
declare
  v_code text;
begin
  -- the roster is the source of truth for who is who. Only take the code if
  -- no existing profile holds it (rep_code is unique).
  select t.code into v_code
  from public.team_members t
  where t.email is not null
    and lower(t.email) = lower(new.email)
    and not exists (select 1 from public.profiles q where q.rep_code = t.code)
  limit 1;

  insert into public.profiles (id, email, full_name, rep_code)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      (select t.name from public.team_members t
        where t.email is not null and lower(t.email) = lower(new.email) limit 1)
    ),
    v_code
  )
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role)
  values (new.id, 'rep')
  on conflict (user_id) do nothing;

  return new;
end;
$$;

commit;
