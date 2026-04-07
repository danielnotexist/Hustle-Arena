alter table public.lobbies
  add column if not exists auto_veto_starts_at timestamptz;

create or replace function public.reset_lobby_veto_state(
  p_lobby_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.lobbies
  set map_voting_active = false,
      selected_map = null,
      auto_veto_starts_at = null,
      updated_at = now()
  where id = p_lobby_id
    and status = 'open';

  update public.map_vote_sessions
  set active_team = 'T',
      turn_ends_at = null,
      remaining_maps = array['dust2','inferno','mirage','nuke','anubis','ancient','overpass'],
      status = 'cancelled',
      round_number = 1,
      last_vetoed_map = null,
      updated_at = now()
  where lobby_id = p_lobby_id;

  delete from public.map_votes
  where session_id in (
    select id
    from public.map_vote_sessions
    where lobby_id = p_lobby_id
  );
end;
$$;

create or replace function public.refresh_lobby_auto_veto(
  p_lobby_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lobby public.lobbies%rowtype;
  v_active_members integer;
  v_ready_members integer;
  v_t_members integer;
  v_ct_members integer;
  v_has_active_session boolean;
begin
  select *
  into v_lobby
  from public.lobbies
  where id = p_lobby_id
  for update;

  if not found then
    return;
  end if;

  if v_lobby.status <> 'open' or coalesce(v_lobby.selected_map, '') <> '' then
    update public.lobbies
    set auto_veto_starts_at = null,
        updated_at = now()
    where id = p_lobby_id
      and auto_veto_starts_at is not null;
    return;
  end if;

  if exists (
    select 1
    from public.matches
    where lobby_id = p_lobby_id
      and status in ('pending', 'live')
  ) then
    update public.lobbies
    set auto_veto_starts_at = null,
        updated_at = now()
    where id = p_lobby_id
      and auto_veto_starts_at is not null;
    return;
  end if;

  select
    count(*) filter (where kicked_at is null and left_at is null),
    count(*) filter (where kicked_at is null and left_at is null and is_ready),
    count(*) filter (where kicked_at is null and left_at is null and team_side = 'T'),
    count(*) filter (where kicked_at is null and left_at is null and team_side = 'CT')
  into v_active_members, v_ready_members, v_t_members, v_ct_members
  from public.lobby_members
  where lobby_id = p_lobby_id;

  select exists (
    select 1
    from public.map_vote_sessions
    where lobby_id = p_lobby_id
      and status = 'active'
  )
  into v_has_active_session;

  if v_active_members = v_lobby.max_players
     and v_ready_members = v_active_members
     and v_t_members = v_lobby.team_size
     and v_ct_members = v_lobby.team_size then
    if v_has_active_session then
      update public.lobbies
      set auto_veto_starts_at = null,
          updated_at = now()
      where id = p_lobby_id
        and auto_veto_starts_at is not null;
      return;
    end if;

    update public.lobbies
    set auto_veto_starts_at = coalesce(auto_veto_starts_at, now() + interval '5 seconds'),
        updated_at = now()
    where id = p_lobby_id;

    return;
  end if;

  perform public.reset_lobby_veto_state(p_lobby_id);
end;
$$;

create or replace function public.sync_lobby_auto_veto(
  p_lobby_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lobby public.lobbies%rowtype;
begin
  perform public.refresh_lobby_auto_veto(p_lobby_id);

  select *
  into v_lobby
  from public.lobbies
  where id = p_lobby_id
  for update;

  if not found then
    return;
  end if;

  if v_lobby.status <> 'open'
     or v_lobby.auto_veto_starts_at is null
     or v_lobby.auto_veto_starts_at > now()
     or coalesce(v_lobby.selected_map, '') <> '' then
    return;
  end if;

  update public.lobbies
  set auto_veto_starts_at = null,
      updated_at = now()
  where id = p_lobby_id;

  perform public.ensure_lobby_map_vote_session(p_lobby_id);
end;
$$;

create or replace function public.set_lobby_member_ready(
  p_lobby_id uuid,
  p_is_ready boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_lobby public.lobbies%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_lobby
  from public.lobbies
  where id = p_lobby_id;

  if not found then
    raise exception 'Lobby not found';
  end if;

  perform public.assert_user_can_access_mode(v_user_id, v_lobby.mode);

  update public.lobby_members
  set is_ready = p_is_ready
  where lobby_id = p_lobby_id
    and user_id = v_user_id
    and kicked_at is null
    and left_at is null;

  if not found then
    raise exception 'You are not an active member of this lobby';
  end if;

  perform public.refresh_lobby_auto_veto(p_lobby_id);
end;
$$;

create or replace function public.set_lobby_member_team_side(
  p_lobby_id uuid,
  p_team_side public.ha_team_side
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_lobby public.lobbies%rowtype;
  v_side_count integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_lobby
  from public.lobbies
  where id = p_lobby_id
  for update;

  if not found then
    raise exception 'Lobby not found';
  end if;

  if v_lobby.status <> 'open' then
    raise exception 'Teams can only be adjusted while the lobby is open';
  end if;

  perform public.assert_user_can_access_mode(v_user_id, v_lobby.mode);

  if not exists (
    select 1
    from public.lobby_members
    where lobby_id = p_lobby_id
      and user_id = v_user_id
      and kicked_at is null
      and left_at is null
  ) then
    raise exception 'You are not an active member of this lobby';
  end if;

  if p_team_side <> 'UNASSIGNED' then
    select count(*)
    into v_side_count
    from public.lobby_members
    where lobby_id = p_lobby_id
      and team_side = p_team_side
      and kicked_at is null
      and left_at is null
      and user_id <> v_user_id;

    if v_side_count >= v_lobby.team_size then
      raise exception 'That team is already full';
    end if;
  end if;

  update public.lobby_members
  set team_side = p_team_side,
      is_ready = false
  where lobby_id = p_lobby_id
    and user_id = v_user_id
    and kicked_at is null
    and left_at is null;

  perform public.refresh_lobby_auto_veto(p_lobby_id);
end;
$$;

create or replace function public.join_matchmaking_lobby(
  p_lobby_id uuid,
  p_password text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_lobby public.lobbies%rowtype;
  v_active_members integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if exists (
    select 1
    from public.lobby_members lm
    join public.lobbies l on l.id = lm.lobby_id
    where lm.user_id = v_user_id
      and lm.kicked_at is null
      and lm.left_at is null
      and l.status in ('open', 'in_progress')
      and l.id <> p_lobby_id
  ) then
    raise exception 'Leave your current lobby before joining another one';
  end if;

  select *
  into v_lobby
  from public.lobbies
  where id = p_lobby_id
  for update;

  if not found then
    raise exception 'Lobby not found';
  end if;

  if v_lobby.status <> 'open' then
    raise exception 'Only open lobbies can be joined';
  end if;

  perform public.assert_user_can_access_mode(v_user_id, v_lobby.mode);

  if v_lobby.password_required then
    if nullif(trim(coalesce(p_password, '')), '') is null or v_lobby.password_hash is null or crypt(trim(p_password), v_lobby.password_hash) <> v_lobby.password_hash then
      raise exception 'Incorrect lobby password';
    end if;
  end if;

  select count(*)
  into v_active_members
  from public.lobby_members
  where lobby_id = p_lobby_id
    and kicked_at is null
    and left_at is null;

  if v_active_members >= v_lobby.max_players then
    raise exception 'Lobby is already full';
  end if;

  insert into public.lobby_members (lobby_id, user_id, team_side, is_ready)
  values (p_lobby_id, v_user_id, 'UNASSIGNED', false)
  on conflict (lobby_id, user_id) do update
  set left_at = null,
      kicked_at = null,
      joined_at = now(),
      team_side = 'UNASSIGNED',
      is_ready = false;

  perform public.refresh_lobby_auto_veto(p_lobby_id);
end;
$$;

create or replace function public.leave_matchmaking_lobby(
  p_lobby_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_lobby public.lobbies%rowtype;
  v_active_members integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_lobby
  from public.lobbies
  where id = p_lobby_id
  for update;

  if not found then
    raise exception 'Lobby not found';
  end if;

  if not exists (
    select 1
    from public.lobby_members
    where lobby_id = p_lobby_id
      and user_id = v_user_id
      and kicked_at is null
      and left_at is null
  ) then
    raise exception 'You are not an active member of this lobby';
  end if;

  if v_lobby.status = 'open' and v_lobby.leader_id = v_user_id then
    update public.lobbies
    set status = 'closed',
        close_reason = 'Lobby closed by leader',
        map_voting_active = false,
        auto_veto_starts_at = null,
        join_server_deadline = null,
        updated_at = now()
    where id = p_lobby_id;

    update public.lobby_members
    set left_at = now(),
        is_ready = false
    where lobby_id = p_lobby_id
      and kicked_at is null
      and left_at is null;

    perform public.reset_lobby_veto_state(p_lobby_id);
    return;
  end if;

  update public.lobby_members
  set left_at = now(),
      is_ready = false
  where lobby_id = p_lobby_id
    and user_id = v_user_id
    and kicked_at is null
    and left_at is null;

  select count(*)
  into v_active_members
  from public.lobby_members
  where lobby_id = p_lobby_id
    and kicked_at is null
    and left_at is null;

  if v_lobby.status = 'open' and v_active_members = 0 then
    update public.lobbies
    set status = 'closed',
        close_reason = 'Lobby emptied',
        map_voting_active = false,
        auto_veto_starts_at = null,
        join_server_deadline = null,
        updated_at = now()
    where id = p_lobby_id;

    perform public.reset_lobby_veto_state(p_lobby_id);
    return;
  end if;

  perform public.refresh_lobby_auto_veto(p_lobby_id);
end;
$$;

create or replace function public.ensure_lobby_map_vote_session(
  p_lobby_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_role public.ha_role;
  v_lobby public.lobbies%rowtype;
  v_session_id uuid;
  v_t_count integer;
  v_ct_count integer;
begin
  if v_actor_id is null then
    raise exception 'Authentication required';
  end if;

  select role into v_actor_role from public.profiles where id = v_actor_id;

  select *
  into v_lobby
  from public.lobbies
  where id = p_lobby_id
  for update;

  if not found then
    raise exception 'Lobby not found';
  end if;

  if v_lobby.leader_id <> v_actor_id and v_actor_role is distinct from 'admin' then
    raise exception 'Only the lobby leader or an admin can start map veto';
  end if;

  if v_lobby.status <> 'open' then
    raise exception 'Map veto can only run while the lobby is open';
  end if;

  select
    count(*) filter (where team_side = 'T' and kicked_at is null and left_at is null),
    count(*) filter (where team_side = 'CT' and kicked_at is null and left_at is null)
  into v_t_count, v_ct_count
  from public.lobby_members
  where lobby_id = p_lobby_id;

  if v_t_count <> v_lobby.team_size or v_ct_count <> v_lobby.team_size then
    raise exception 'Fill both teams before starting map veto';
  end if;

  select id
  into v_session_id
  from public.map_vote_sessions
  where lobby_id = p_lobby_id;

  if v_session_id is null then
    insert into public.map_vote_sessions (
      lobby_id,
      active_team,
      turn_ends_at,
      turn_seconds,
      remaining_maps,
      status,
      round_number
    ) values (
      p_lobby_id,
      'T',
      now() + interval '15 seconds',
      15,
      array['dust2','inferno','mirage','nuke','anubis','ancient','overpass'],
      'active',
      1
    )
    returning id into v_session_id;
  else
    update public.map_vote_sessions
    set active_team = 'T',
        turn_ends_at = now() + make_interval(secs => coalesce(turn_seconds, 15)),
        remaining_maps = array['dust2','inferno','mirage','nuke','anubis','ancient','overpass'],
        status = 'active',
        round_number = 1,
        last_vetoed_map = null,
        updated_at = now()
    where id = v_session_id;

    delete from public.map_votes where session_id = v_session_id;
  end if;

  update public.lobbies
  set selected_map = null,
      map_voting_active = true,
      auto_veto_starts_at = null,
      updated_at = now()
  where id = p_lobby_id;

  return v_session_id;
end;
$$;

create or replace function public.kick_lobby_member(
  p_lobby_id uuid,
  p_target_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_role public.ha_role;
  v_lobby public.lobbies%rowtype;
begin
  if v_actor_id is null then
    raise exception 'Authentication required';
  end if;

  select role into v_actor_role from public.profiles where id = v_actor_id;

  select *
  into v_lobby
  from public.lobbies
  where id = p_lobby_id
  for update;

  if not found then
    raise exception 'Lobby not found';
  end if;

  if v_lobby.leader_id <> v_actor_id and v_actor_role is distinct from 'admin' then
    raise exception 'Only the lobby organiser or an admin can kick players';
  end if;

  if p_target_user_id = v_lobby.leader_id then
    raise exception 'The lobby organiser cannot be kicked';
  end if;

  update public.lobby_members
  set kicked_at = now(),
      left_at = coalesce(left_at, now()),
      team_side = 'UNASSIGNED',
      is_ready = false
  where lobby_id = p_lobby_id
    and user_id = p_target_user_id
    and kicked_at is null
    and left_at is null;

  if not found then
    raise exception 'Target player is not an active member of this lobby';
  end if;

  perform public.refresh_lobby_auto_veto(p_lobby_id);
end;
$$;
