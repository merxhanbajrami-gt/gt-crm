-- GT / OS — multiple contacts per deal + LinkedIn profiles
-- Feedback tickets (Jul 2026):
--  * contacts created with a deal should land in the Contacts module, linked
--    to the deal and searchable there
--  * a deal should support more than one contact
--  * contacts (and the deal's primary contact) can carry a LinkedIn URL,
--    shown as a small icon that opens the profile in a new tab

-- link contacts to deals. `set null` (not cascade): the contact book is the
-- long-lived relationship record — deleting a deal shouldn't erase people.
alter table public.contacts
  add column if not exists deal_id uuid references public.deals (id) on delete set null;

alter table public.contacts
  add column if not exists linkedin_url text;

-- the deal's primary contact (the name/email/phone stored on the deal itself)
alter table public.deals
  add column if not exists linkedin_url text;

create index if not exists contacts_deal_id_idx on public.contacts (deal_id);

-- best-effort backfill: attach imported contacts to their deal where the
-- dealname is unambiguous (skip dealnames shared by several deals)
update public.contacts c
set deal_id = d.id
from public.deals d
where c.deal_id is null
  and c.dealname is not null
  and c.dealname = d.dealname
  and not exists (
    select 1 from public.deals d2
    where d2.dealname = d.dealname and d2.id <> d.id
  );
