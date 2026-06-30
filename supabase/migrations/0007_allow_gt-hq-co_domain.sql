-- GT / OS — allow the secondary GT-HQ domain (gt-hq.co) to sign in.
-- Some team members use @gt-hq.co rather than @gt-hq.com; both are GT-HQ accounts.
-- The Before-User-Created hook (0003) checks signup_email_domains, so adding the
-- domain here is all that's needed — no hook change required.
insert into public.signup_email_domains (domain) values ('gt-hq.co')
on conflict (domain) do nothing;
