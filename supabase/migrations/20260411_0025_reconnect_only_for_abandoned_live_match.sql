-- 20260411_0025_reconnect_only_for_abandoned_live_match.sql

create or replace function public.get_my_reconnectable_match()
returns table (
  match_id uuid,
  lobby_id uuid,
  mode public.ha_mode,
  lobby_name text,
  game_mode text,
  selected_map text,
  status public.ha_match_status,
  dedicated_server_endpoint text
)
language sql
security definer
set search_path = public
as $$
  select
    m.id,
    m.lobby_id,
    m.mode,
    l.name,
    l.game_mode,
    l.selected_map,
    m.status,
    m.dedicated_server_endpoint
  from public.matches m
  join public.match_players mp on mp.match_id = m.id
  join public.lobbies l on l.id = m.lobby_id
  where mp.user_id = auth.uid()
    and m.status = 'live'
    and m.ended_at is null
    and l.status = 'in_progress'
    and mp.abandoned_at is not null
  order by coalesce(mp.abandoned_at, m.started_at, m.created_at) desc
  limit 1;
$$;

create or replace function public.player_join_match_server(
  p_match_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_match public.matches%rowtype;
  v_lobby public.lobbies%rowtype;
  v_joined_count integer;
  v_total_players integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_match
  from public.matches
  where id = p_match_id
  for update;

  if not found then
    raise exception 'Match not found';
  end if;

  if v_match.status not in ('pending', 'live') then
    raise exception 'This match is no longer joinable';
  end if;

  if not exists (
    select 1
    from public.match_players
    where match_id = p_match_id
      and user_id = v_user_id
  ) then
    raise exception 'You are not assigned to this match';
  end if;

  update public.match_players
  set joined_server = true,
      joined_server_at = coalesce(joined_server_at, now()),
      abandoned_at = null
  where match_id = p_match_id
    and user_id = v_user_id;

  select *
  into v_lobby
  from public.lobbies
  where id = v_match.lobby_id
  for update;

  select
    count(*) filter (where joined_server),
    count(*)
  into v_joined_count, v_total_players
  from public.match_players
  where match_id = p_match_id;

  if v_joined_count = v_total_players and v_total_players > 0 then
    update public.matches
    set status = 'live',
        started_at = coalesce(started_at, now())
    where id = p_match_id;

    update public.lobbies
    set status = 'in_progress',
        join_server_deadline = null,
        updated_at = now()
    where id = v_match.lobby_id;
  else
    update public.lobbies
    set join_server_deadline = coalesce(join_server_deadline, now() + interval '3 minutes'),
        updated_at = now()
    where id = v_match.lobby_id;
  end if;

  return coalesce(
    v_match.dedicated_server_endpoint,
    public.build_match_server_endpoint(
      v_match.id,
      v_lobby.name,
      v_lobby.game_mode,
      v_lobby.selected_map,
      v_lobby.mode
    )
  );
end;
$$;
