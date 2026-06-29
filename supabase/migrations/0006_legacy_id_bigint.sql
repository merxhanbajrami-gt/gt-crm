-- HubSpot Record IDs are bigint-sized (up to ~10^12), but legacy_id was int4
-- (max ~2.15e9). Widen it on both tables so the real export can be imported
-- without overflow. Unique constraints are preserved across the type change.
alter table public.deals    alter column legacy_id type bigint;
alter table public.contacts alter column legacy_id type bigint;
