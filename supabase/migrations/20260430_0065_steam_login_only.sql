-- 20260430_0065_steam_login_only.sql
-- Steam identity is now established only by the server-verified Steam login flow.

create or replace function public.update_my_steam_id64(p_steam_id64 text)
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
begin
  raise exception 'SteamID64 can only be set by signing in with Steam';
end;
$$;

revoke all on function public.update_my_steam_id64(text) from public;
revoke all on function public.update_my_steam_id64(text) from authenticated;

create or replace function public.sync_match_connected_steam_ids(
  p_match_id uuid,
  p_connected_steam_ids text[]
)
returns table (
  user_id uuid,
  steam_id64 text,
  joined_server boolean,
  joined_server_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_connected_steam_ids text[];
begin
  perform public.assert_service_role_or_admin();

  if p_match_id is null then
    raise exception 'Match id is required';
  end if;

  select coalesce(array_agg(distinct normalized_id), array[]::text[])
  into v_connected_steam_ids
  from (
    select public.normalize_steam_id64(steam_id) as normalized_id
    from unnest(coalesce(p_connected_steam_ids, array[]::text[])) as steam_id
  ) normalized
  where normalized_id ~ '^[0-9]{17}$';

  update public.match_players mp
  set joined_server = mp.steam_id64 = any(v_connected_steam_ids),
      joined_server_at = case
        when mp.steam_id64 = any(v_connected_steam_ids) then coalesce(mp.joined_server_at, now())
        else mp.joined_server_at
      end
  where mp.match_id = p_match_id
    and mp.steam_id64 is not null;

  return query
  select mp.user_id, mp.steam_id64, mp.joined_server, mp.joined_server_at
  from public.match_players mp
  where mp.match_id = p_match_id
  order by mp.user_id;
end;
$$;

revoke all on function public.sync_match_connected_steam_ids(uuid, text[]) from public;
grant execute on function public.sync_match_connected_steam_ids(uuid, text[]) to authenticated;
grant execute on function public.sync_match_connected_steam_ids(uuid, text[]) to service_role;
