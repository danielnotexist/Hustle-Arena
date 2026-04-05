-- 20260405_0013_server_join_and_reconnect_flow.sql

create or replace function public.build_match_server_endpoint(
  p_match_id uuid,
  p_lobby_name text,
  p_game_mode text,
  p_selected_map text,
  p_mode public.ha_mode
)
returns text
language plpgsql
immutable
as $$
begin
  return 'steam://connect/hustle-arena.local/' || p_match_id::text
    || '?mode=' || coalesce(p_game_mode, 'competitive')
    || '&map=' || coalesce(p_selected_map, 'tbd')
    || '&env=' || p_mode::text
    || '&lobby=' || replace(lower(coalesce(p_lobby_name, 'arena')), ' ', '-');
end;
$$;

create or replace function public.ensure_pending_lobby_match(
  p_lobby_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lobby public.lobbies%rowtype;
  v_match_id uuid;
begin
  select *
  into v_lobby
  from public.lobbies
  where id = p_lobby_id
  for update;

  if not found then
    raise exception 'Lobby not found';
  end if;

  if coalesce(v_lobby.selected_map, '') = '' then
    raise exception 'A final map must be selected before preparing the server';
  end if;

  select id
  into v_match_id
  from public.matches
  where lobby_id = p_lobby_id
    and status in ('pending', 'live')
  limit 1;

  if v_match_id is null then
    insert into public.matches (
      lobby_id,
      mode,
      status,
      dedicated_server_id,
      dedicated_server_endpoint
    ) values (
      v_lobby.id,
      v_lobby.mode,
      'pending',
      'pending-allocation',
      public.build_match_server_endpoint(
        gen_random_uuid(),
        v_lobby.name,
        v_lobby.game_mode,
        v_lobby.selected_map,
        v_lobby.mode
      )
    )
    returning id into v_match_id;

    update public.matches
    set dedicated_server_endpoint = public.build_match_server_endpoint(
      v_match_id,
      v_lobby.name,
      v_lobby.game_mode,
      v_lobby.selected_map,
      v_lobby.mode
    )
    where id = v_match_id;

    insert into public.match_players (
      match_id,
      user_id,
      team_side,
      joined_server,
      joined_server_at
    )
    select
      v_match_id,
      lm.user_id,
      lm.team_side,
      false,
      null
    from public.lobby_members lm
    where lm.lobby_id = p_lobby_id
      and lm.kicked_at is null
      and lm.left_at is null;
  end if;

  return v_match_id;
end;
$$;

create or replace function public.advance_map_vote_round(
  p_session_id uuid,
  p_veto_map text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.map_vote_sessions%rowtype;
  v_lobby public.lobbies%rowtype;
  v_veto_map text;
  v_remaining_maps text[];
begin
  select *
  into v_session
  from public.map_vote_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'Map vote session not found';
  end if;

  if v_session.status <> 'active' then
    return;
  end if;

  select *
  into v_lobby
  from public.lobbies
  where id = v_session.lobby_id
  for update;

  if not found then
    raise exception 'Lobby not found';
  end if;

  if p_veto_map is not null and not (p_veto_map = any(v_session.remaining_maps)) then
    raise exception 'Selected map is not available for veto';
  end if;

  if p_veto_map is null then
    select mv.map_code
    into v_veto_map
    from public.map_votes mv
    join public.lobby_members lm
      on lm.lobby_id = v_session.lobby_id
     and lm.user_id = mv.user_id
     and lm.kicked_at is null
     and lm.left_at is null
     and lm.team_side = v_session.active_team
    where mv.session_id = v_session.id
      and mv.map_code = any(v_session.remaining_maps)
    group by mv.map_code
    order by count(*) desc, mv.updated_at asc, mv.map_code asc
    limit 1;
  else
    v_veto_map := p_veto_map;
  end if;

  if v_veto_map is null then
    v_veto_map := v_session.remaining_maps[1];
  end if;

  v_remaining_maps := array_remove(v_session.remaining_maps, v_veto_map);

  delete from public.map_votes
  where session_id = v_session.id;

  if coalesce(array_length(v_remaining_maps, 1), 0) <= 1 then
    update public.map_vote_sessions
    set remaining_maps = v_remaining_maps,
        status = 'completed',
        last_vetoed_map = v_veto_map,
        turn_ends_at = null,
        updated_at = now()
    where id = v_session.id;

    update public.lobbies
    set selected_map = coalesce(v_remaining_maps[1], v_veto_map),
        map_voting_active = false,
        updated_at = now()
    where id = v_session.lobby_id;

    perform public.ensure_pending_lobby_match(v_session.lobby_id);
  else
    update public.map_vote_sessions
    set remaining_maps = v_remaining_maps,
        active_team = case when v_session.active_team = 'T' then 'CT'::public.ha_team_side else 'T'::public.ha_team_side end,
        round_number = coalesce(v_session.round_number, 1) + 1,
        last_vetoed_map = v_veto_map,
        turn_ends_at = now() + make_interval(secs => coalesce(v_session.turn_seconds, 15)),
        updated_at = now()
    where id = v_session.id;
  end if;
end;
$$;

create or replace function public.start_lobby_match(
  p_lobby_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.ensure_pending_lobby_match(p_lobby_id);
end;
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
      joined_server_at = coalesce(joined_server_at, now())
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
    and mp.joined_server = true
    and m.status = 'live'
  order by coalesce(m.started_at, m.created_at) desc
  limit 1;
$$;
