-- 20260502_0067_steam_profile_summary.sql
-- Persist public Steam profile details fetched during verified Steam login.

alter table public.profiles
  add column if not exists steam_avatar_url text,
  add column if not exists steam_member_since date,
  add column if not exists steam_profile_url text,
  add column if not exists steam_profile_fetched_at timestamptz;

drop function if exists public.get_my_profile();
create or replace function public.get_my_profile()
returns table (
  id uuid,
  username text,
  email text,
  role public.ha_role,
  level integer,
  kyc_status public.ha_kyc_status,
  is_banned boolean,
  suspended_until timestamptz,
  cooldown_until timestamptz,
  available_balance numeric,
  locked_balance numeric,
  demo_balance numeric,
  steam_id64 text,
  steam_verified boolean,
  steam_linked_at timestamptz,
  steam_last_verified_at timestamptz,
  steam_avatar_url text,
  steam_member_since date,
  steam_profile_url text
)
language sql
security definer
set search_path = public
as $$
  select p.id, p.username, p.email, p.role, p.level, p.kyc_status, p.is_banned, p.suspended_until, p.cooldown_until,
         coalesce(w.available_balance,0), coalesce(w.locked_balance,0), coalesce(w.demo_balance,0),
         p.steam_id64, coalesce(p.steam_verified, false), p.steam_linked_at, p.steam_last_verified_at,
         p.steam_avatar_url, p.steam_member_since, p.steam_profile_url
  from public.profiles p
  left join public.wallets w on w.user_id = p.id
  where p.id = auth.uid();
$$;

grant execute on function public.get_my_profile() to authenticated;
