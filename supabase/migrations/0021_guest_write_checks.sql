-- GT / OS — tighter guest writes (security review of 0020)
-- 0020 checked what a guest writes against one shared reference. That let a
-- guest attach its rows to records it can't see:
--  * a contact added to a shared deal could carry any owner, or a hidden
--    company, and so land in another rep's book or on a hidden company
--  * a note on a shared deal could also carry a hidden contact or company
--    (or a hidden deal plus a shared contact), and show on that record
--  * a note could carry someone else's owner_id or owner_code
-- Now every reference a guest writes must be shared, and the row must be in
-- the guest's own name. Reads are unchanged.

begin;

-- ---------- contacts ----------
-- the owner comes from the deal (the drawer copies it), and a company, if
-- any, must be one the guest can see
drop policy if exists contacts_guest_insert on public.contacts;
create policy contacts_guest_insert on public.contacts for insert to authenticated
  with check (
    (select public.is_guest())
    and public.deal_shared_with_me(deal_id)
    and (company_id is null or public.company_shared_with_me(company_id))
    and exists (
      select 1 from public.deals d
      where d.id = contacts.deal_id
        and d.owner_code is not distinct from contacts.owner_code
        and d.owner_id is not distinct from contacts.owner_id
    )
  );

-- ---------- actions ----------
-- Every reference must be shared, and at least one must be set. The OR in
-- action_shared_with_me stays for reads: a guest sees a note when any of
-- its records is shared.
create or replace function public.action_writable_by_me(
  p_deal uuid, p_contact uuid, p_company uuid
)
returns boolean language sql stable
security definer set search_path = ''
as $$
  select (p_deal is not null or p_contact is not null or p_company is not null)
     and (p_deal is null or public.deal_shared_with_me(p_deal))
     and (p_contact is null or public.contact_shared_with_me(p_contact))
     and (p_company is null or public.company_shared_with_me(p_company));
$$;

-- In the guest's own name: a note carries its owner_id; a task carries
-- created_by, no owner_id, and the assignee's code. A guest has no rep code,
-- so only a task may carry one.
drop policy if exists actions_guest_insert on public.actions;
create policy actions_guest_insert on public.actions for insert to authenticated
  with check (
    (select public.is_guest())
    and (owner_id = (select auth.uid())
         or (owner_id is null and created_by = (select auth.uid())))
    and (owner_code is null or kind = 'task')
    and public.action_writable_by_me(deal_id, contact_id, company_id)
  );

drop policy if exists actions_guest_update on public.actions;
create policy actions_guest_update on public.actions for update to authenticated
  using (
    (select public.is_guest())
    and (owner_id = (select auth.uid())
         or (owner_id is null and created_by = (select auth.uid())))
    and public.action_writable_by_me(deal_id, contact_id, company_id)
  )
  with check (
    (select public.is_guest())
    and (owner_id = (select auth.uid())
         or (owner_id is null and created_by = (select auth.uid())))
    and (owner_code is null or kind = 'task')
    and public.action_writable_by_me(deal_id, contact_id, company_id)
  );

drop policy if exists actions_guest_delete on public.actions;
create policy actions_guest_delete on public.actions for delete to authenticated
  using (
    (select public.is_guest())
    and (owner_id = (select auth.uid())
         or (owner_id is null and created_by = (select auth.uid())))
    and public.action_writable_by_me(deal_id, contact_id, company_id)
  );

commit;
