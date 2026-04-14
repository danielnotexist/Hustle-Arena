-- 20260415_0051_party_stake_updates_grants.sql
-- Fix production 403/42501 on quick_queue_party_stake_updates reads.

grant select on table public.quick_queue_party_stake_updates to authenticated;
