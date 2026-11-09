-- RLS checks for guest access (0020, 0021). Everything runs in one transaction that
-- rolls back, so this is safe to run against the live database:
--
--   scripts/db.sh -f supabase/tests/guest_access.sql
--
-- The e2e@gt-hq.com user plays the guest through JWT claims; its user_roles
-- row is not changed. Its profile carries rep code E2E, which also proves that
-- a guest's rep code is ignored. A failed check raises an exception, psql
-- stops (ON_ERROR_STOP), and the transaction is rolled back.

\set ON_ERROR_STOP 1
begin;

-- ---------- fixtures, picked as postgres ----------
select u.id as guest
from auth.users u
where u.email = 'e2e@gt-hq.com' \gset

select u.id as admin
from auth.users u
join public.user_roles r on r.user_id = u.id
where r.role = 'admin'
order by u.created_at
limit 1 \gset

-- the deal to share: has a company and at least one linked contact
select d.id as shared_deal, d.company_id as shared_company
from public.deals d
where d.company_id is not null
  and exists (select 1 from public.contacts c where c.deal_id = d.id)
order by d.created_at
limit 1 \gset

-- a deal that stays hidden, on another company
select d.id as hidden_deal, d.company_id as hidden_company
from public.deals d
where d.company_id is not null
  and d.company_id <> :'shared_company'
order by d.created_at
limit 1 \gset

select c.id as hidden_contact
from public.contacts c
where c.deal_id is distinct from :'shared_deal'
limit 1 \gset

select c.id as shared_contact
from public.contacts c
where c.deal_id = :'shared_deal'
limit 1 \gset

-- what the guest should see
select
  (select count(*) from public.contacts where deal_id = :'shared_deal') as want_contacts,
  (select count(*) from public.actions a
   where a.deal_id = :'shared_deal'
      or a.contact_id in (select id from public.contacts where deal_id = :'shared_deal')
      or (a.deal_id is null and a.contact_id is null
          and a.company_id = :'shared_company')) as want_actions,
  (select count(*) from public.deals) as all_deals,
  (select count(*) from public.companies) as all_companies,
  (select count(*) from public.ideas) as all_ideas \gset

-- DO blocks can't read psql variables, so pass them as settings
select
  set_config('t.guest',          :'guest',          true),
  set_config('t.admin',          :'admin',          true),
  set_config('t.shared_deal',    :'shared_deal',    true),
  set_config('t.shared_company', :'shared_company', true),
  set_config('t.hidden_deal',    :'hidden_deal',    true),
  set_config('t.hidden_company', :'hidden_company', true),
  set_config('t.hidden_contact', :'hidden_contact', true),
  set_config('t.shared_contact', :'shared_contact', true),
  set_config('t.want_contacts',  :'want_contacts',  true),
  set_config('t.want_actions',   :'want_actions',   true),
  set_config('t.all_deals',      :'all_deals',      true),
  set_config('t.all_companies',  :'all_companies',  true),
  set_config('t.all_ideas',      :'all_ideas',      true);

insert into public.deal_shares (deal_id, user_id, granted_by)
values (:'shared_deal', :'guest', :'admin');

-- ---------- as the guest ----------
set local role authenticated;
select set_config('request.jwt.claims', json_build_object(
  'sub', :'guest', 'role', 'authenticated', 'user_role', 'guest')::text, true);

do $$
declare
  guest          uuid := current_setting('t.guest')::uuid;
  shared_deal    uuid := current_setting('t.shared_deal')::uuid;
  shared_company uuid := current_setting('t.shared_company')::uuid;
  hidden_deal    uuid := current_setting('t.hidden_deal')::uuid;
  hidden_company uuid := current_setting('t.hidden_company')::uuid;
  hidden_contact uuid := current_setting('t.hidden_contact')::uuid;
  shared_contact uuid := current_setting('t.shared_contact')::uuid;
  admin          uuid := current_setting('t.admin')::uuid;
  n bigint;
begin
  -- reads
  if public.current_rep_code() is not null then
    raise exception 'guest has rep code %', public.current_rep_code();
  end if;

  select count(*) into n from public.deals;
  if n <> 1 then raise exception 'guest sees % deals, want 1', n; end if;
  select count(*) into n from public.deals where id = shared_deal;
  if n <> 1 then raise exception 'guest cannot see the shared deal'; end if;

  select count(*) into n from public.contacts;
  if n <> current_setting('t.want_contacts')::bigint then
    raise exception 'guest sees % contacts, want %', n, current_setting('t.want_contacts');
  end if;
  select count(*) into n from public.contacts where deal_id is distinct from shared_deal;
  if n <> 0 then raise exception 'guest sees % contacts of other deals', n; end if;

  -- search reads the same rows (Contacts tab search is an ilike over RLS)
  select count(*) into n from public.contacts
  where name ilike '%a%' and deal_id is distinct from shared_deal;
  if n <> 0 then raise exception 'contact search leaks % rows', n; end if;

  select count(*) into n from public.companies;
  if n <> 1 then raise exception 'guest sees % companies, want 1', n; end if;
  select count(*) into n from public.v_companies where id = shared_company;
  if n <> 1 then raise exception 'guest cannot see the shared company'; end if;
  select count(*) into n from public.v_companies;
  if n <> 1 then raise exception 'v_companies shows % rows, want 1', n; end if;

  select count(*) into n from public.actions;
  if n <> current_setting('t.want_actions')::bigint then
    raise exception 'guest sees % actions, want %', n, current_setting('t.want_actions');
  end if;

  select count(*) into n from public.ideas;
  if n <> 0 then raise exception 'guest sees % ideas', n; end if;

  select count(*) into n from public.deal_stage_events where deal_id <> shared_deal;
  if n <> 0 then raise exception 'guest sees stage history of % other deals', n; end if;

  select count(*) into n from public.deal_shares;
  if n <> 1 then raise exception 'guest sees % shares, want 1', n; end if;

  if (select has_deals from public.company_client_facts(hidden_company)) then
    raise exception 'company_client_facts leaks deals of a hidden company';
  end if;

  -- deal writes
  update public.deals set value = value + 1 where id = shared_deal;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'guest cannot edit the shared deal'; end if;

  update public.deals
  set stage = case when stage = 'pursue' then 'attack' else 'pursue' end
  where id = shared_deal;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'guest cannot move the shared deal'; end if;

  update public.deals set value = value + 1 where id = hidden_deal;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'guest edited a hidden deal'; end if;

  delete from public.deals where id = shared_deal;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'guest deleted the shared deal'; end if;

  begin
    insert into public.deals (company, dealname) values ('Guest test', 'Guest test');
    raise exception 'guest created a deal';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.deals set owner_code = 'OK', owner_name = 'Oleksandr'
    where id = shared_deal;
    raise exception 'guest changed the deal owner';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.deals set company_id = hidden_company where id = shared_deal;
    raise exception 'guest linked the deal to a hidden company';
  exception when insufficient_privilege then null;
  end;

  -- contact writes: the owner comes from the deal, as the drawer sends it
  insert into public.contacts (deal_id, name, owner_code, owner_id)
  select id, 'Guest test', owner_code, owner_id
  from public.deals where id = shared_deal;

  begin
    insert into public.contacts (deal_id, name, owner_code)
    values (shared_deal, 'Guest test', 'NOT-THE-OWNER');
    raise exception 'guest added a contact under another owner';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.contacts (deal_id, name, owner_code, owner_id, company_id)
    select id, 'Guest test', owner_code, owner_id, hidden_company
    from public.deals where id = shared_deal;
    raise exception 'guest added a contact to a hidden company';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.contacts (deal_id, name) values (hidden_deal, 'Guest test');
    raise exception 'guest added a contact to a hidden deal';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.contacts (name) values ('Guest test');
    raise exception 'guest added a contact with no deal';
  exception when insufficient_privilege then null;
  end;

  update public.contacts set title = coalesce(title, '') where deal_id = shared_deal;
  get diagnostics n = row_count;
  if n < 1 then raise exception 'guest cannot edit a shared contact'; end if;

  update public.contacts set title = coalesce(title, '') where id = hidden_contact;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'guest edited a hidden contact'; end if;

  begin
    update public.contacts set deal_id = hidden_deal where deal_id = shared_deal;
    raise exception 'guest moved a contact to a hidden deal';
  exception when insufficient_privilege then null;
  end;

  delete from public.contacts where deal_id = shared_deal;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'guest deleted % contacts', n; end if;

  -- company writes
  update public.companies set city = city where id = shared_company;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'guest cannot edit the shared company'; end if;

  update public.companies set city = city where id = hidden_company;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'guest edited a hidden company'; end if;

  delete from public.companies where id = shared_company;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'guest deleted the shared company'; end if;

  begin
    insert into public.companies (name) values ('Guest test');
    raise exception 'guest created a company';
  exception when insufficient_privilege then null;
  end;

  -- notes and tasks
  insert into public.actions (deal_id, owner_id, kind, note)
  values (shared_deal, guest, 'note', 'guest note');
  insert into public.actions (deal_id, owner_code, created_by, kind, note, done)
  values (shared_deal, 'OK', guest, 'task', 'guest task', false);
  insert into public.actions (company_id, owner_id, kind, note)
  values (shared_company, guest, 'note', 'guest company note');

  update public.actions set note = note || '!' where deal_id = shared_deal and owner_id = guest;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'guest cannot edit its own note'; end if;

  begin
    insert into public.actions (deal_id, owner_id, kind, note)
    values (hidden_deal, guest, 'note', 'guest note');
    raise exception 'guest wrote a note on a hidden deal';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.actions (company_id, owner_id, kind, note)
    values (hidden_company, guest, 'note', 'guest note');
    raise exception 'guest wrote a note on a hidden company';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.actions (deal_id, owner_code, kind, note)
    values (shared_deal, 'OK', 'note', 'not mine');
    raise exception 'guest wrote a note in someone else''s name';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.actions (deal_id, owner_id, owner_code, kind, note)
    values (shared_deal, guest, 'OK', 'note', 'signed as OK');
    raise exception 'guest put another rep code on its note';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.actions (deal_id, owner_id, created_by, kind, note)
    values (shared_deal, admin, guest, 'note', 'as the admin');
    raise exception 'guest wrote a note with the admin as owner';
  exception when insufficient_privilege then null;
  end;

  -- every reference on a guest's note must be shared, not just one
  insert into public.actions (contact_id, owner_id, kind, note)
  values (shared_contact, guest, 'note', 'guest contact note');

  begin
    insert into public.actions (deal_id, contact_id, owner_id, kind, note)
    values (shared_deal, hidden_contact, guest, 'note', 'onto a hidden contact');
    raise exception 'guest tagged a hidden contact on its note';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.actions (deal_id, company_id, owner_id, kind, note)
    values (shared_deal, hidden_company, guest, 'note', 'onto a hidden company');
    raise exception 'guest tagged a hidden company on its note';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.actions (deal_id, contact_id, owner_id, kind, note)
    values (hidden_deal, shared_contact, guest, 'note', 'onto a hidden deal');
    raise exception 'guest tagged a hidden deal on its note';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.actions (owner_id, kind, note)
    values (guest, 'note', 'on nothing');
    raise exception 'guest wrote a note on no record';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.actions set contact_id = hidden_contact
    where deal_id = shared_deal and owner_id = guest;
    raise exception 'guest moved its note onto a hidden contact';
  exception when insufficient_privilege then null;
  end;

  -- shares and ideas
  begin
    insert into public.deal_shares (deal_id, user_id) values (hidden_deal, guest);
    raise exception 'guest shared a deal with itself';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.ideas (title) values ('Guest test');
    raise exception 'guest wrote to the ideas board';
  exception when insufficient_privilege then null;
  end;

  raise notice 'guest checks passed';
end $$;

-- ---------- as a rep (same user, rep role): no change from before ----------
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object(
  'sub', :'guest', 'role', 'authenticated', 'user_role', 'rep')::text, true);

do $$
declare
  n bigint;
begin
  if public.current_rep_code() is distinct from 'E2E' then
    raise exception 'rep lost its rep code: %', public.current_rep_code();
  end if;

  select count(*) into n from public.companies;
  if n <> current_setting('t.all_companies')::bigint then
    raise exception 'rep sees % companies, want all %', n, current_setting('t.all_companies');
  end if;

  select count(*) into n from public.ideas;
  if n <> current_setting('t.all_ideas')::bigint then
    raise exception 'rep sees % ideas, want all %', n, current_setting('t.all_ideas');
  end if;

  -- the share is for the guest role only; a rep gets nothing from it
  select count(*) into n from public.deals
  where id = current_setting('t.shared_deal')::uuid and owner_code is distinct from 'E2E';
  if n <> 0 then raise exception 'rep sees the shared deal through the share'; end if;

  raise notice 'rep checks passed';
end $$;

-- ---------- as an admin ----------
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object(
  'sub', :'admin', 'role', 'authenticated', 'user_role', 'admin')::text, true);

do $$
declare
  guest       uuid := current_setting('t.guest')::uuid;
  hidden_deal uuid := current_setting('t.hidden_deal')::uuid;
  n bigint;
begin
  select count(*) into n from public.deals;
  if n < current_setting('t.all_deals')::bigint then
    raise exception 'admin sees % deals, want all %', n, current_setting('t.all_deals');
  end if;

  insert into public.deal_shares (deal_id, user_id) values (hidden_deal, guest);
  select count(*) into n from public.deal_shares where user_id = guest;
  if n <> 2 then raise exception 'admin sees % shares, want 2', n; end if;

  delete from public.deal_shares where deal_id = hidden_deal and user_id = guest;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'admin cannot remove a share'; end if;

  -- the owner guard only applies to guests
  update public.deals set owner_code = owner_code where id = hidden_deal;

  raise notice 'admin checks passed';
end $$;

reset role;
\echo 'guest_access: all checks passed (rolling back)'
rollback;
