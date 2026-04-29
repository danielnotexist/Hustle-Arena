-- 20260429_0064_verified_steam_openid_link.sql
-- Replace manual SteamID entry with a server-verified Steam OpenID link flow.

create or replace function public.link_verified_steam_id64(
  p_user_id uuid,
  p_steam_id64 text
)
returns table (
  steam_id64 text,
  steam_verified boolean,
  steam_linked_at timestamptz,
  steam_last_verified_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_steam_id64 text := public.normalize_steam_id64(p_steam_id64);
begin
  if auth.role() <> 'service_role' then
    raise exception 'Only service workers can link verified Steam accounts';
  end if;

  if p_user_id is null then
    raise exception 'User id is required';
  end if;

  if v_steam_id64 is null or v_steam_id64 !~ '^[0-9]{17}$' then
    raise exception 'Steam did not return a valid SteamID64';
  end if;

  if exists (
    select 1
    from public.profiles p
    where p.steam_id64 = v_steam_id64
      and p.id <> p_user_id
  ) then
    raise exception 'This Steam account is already linked to another Hustle Arena account';
  end if;

  if exists (
    select 1
    from public.match_players mp
    join public.matches m on m.id = mp.match_id
    where mp.user_id = p_user_id
      and m.status in ('pending', 'live')
  ) then
    raise exception 'You cannot change Steam account while assigned to an active match';
  end if;

  update public.profiles p
  set steam_id64 = v_steam_id64,
      steam_verified = true,
      steam_linked_at = coalesce(p.steam_linked_at, now()),
      steam_last_verified_at = now(),
      updated_at = now()
  where p.id = p_user_id;

  if not found then
    raise exception 'Player profile not found';
  end if;

  return query
  select p.steam_id64, p.steam_verified, p.steam_linked_at, p.steam_last_verified_at
  from public.profiles p
  where p.id = p_user_id;
end;
$$;

revoke all on function public.link_verified_steam_id64(uuid, text) from public;
grant execute on function public.link_verified_steam_id64(uuid, text) to service_role;

create or replace function public.assert_user_has_cs2_identity(
  p_user_id uuid,
  p_mode public.ha_mode,
  p_stake_amount numeric default 0
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
begin
  select *
  into v_profile
  from public.profiles
  where id = p_user_id;

  if not found then
    raise exception 'Player profile not found';
  end if;

  if nullif(trim(coalesce(v_profile.steam_id64, '')), '') is null
     or not coalesce(v_profile.steam_verified, false) then
    raise exception 'Connect your Steam account before playing CS2';
  end if;
end;
$$;

grant execute on function public.assert_user_has_cs2_identity(uuid, public.ha_mode, numeric) to authenticated;
