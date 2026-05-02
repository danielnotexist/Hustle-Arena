-- 20260503_0068_public_profile_steam_identity.sql
-- Include verified Steam identity details on public profile pages.

drop function if exists public.get_public_profile_details(uuid);

create or replace function public.get_public_profile_details(
  p_user_id uuid
)
returns table (
  id uuid,
  username text,
  email text,
  avatar_url text,
  cover_url text,
  bio text,
  country text,
  rank text,
  win_rate text,
  kd_ratio numeric,
  headshot_pct text,
  level integer,
  last_active_at timestamptz,
  steam_id64 text,
  steam_verified boolean,
  steam_member_since date
)
language sql
security definer
set search_path = public
as $$
  select
    p.id,
    p.username,
    p.email,
    p.avatar_url,
    p.cover_url,
    p.bio,
    p.country,
    p.rank,
    p.win_rate,
    p.kd_ratio,
    p.headshot_pct,
    p.level,
    p.last_active_at,
    p.steam_id64,
    coalesce(p.steam_verified, false),
    p.steam_member_since
  from public.profiles p
  where p.id = p_user_id
  limit 1;
$$;

grant execute on function public.get_public_profile_details(uuid) to authenticated;
