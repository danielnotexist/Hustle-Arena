-- 20260405_0012_custom_lobby_browser_and_map_veto.sql

alter table public.lobbies
  add column if not exists password_required boolean not null default false;

update public.lobbies
set password_required = coalesce(nullif(password_hash, ''), '') <> ''
where password_required is distinct from (coalesce(nullif(password_hash, ''), '') <> '');

alter table public.map_vote_sessions
  add column if not exists round_number integer not null default 1;

alter table public.map_vote_sessions
  add column if not exists last_vetoed_map text;

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
      updated_at = now()
  where id = p_lobby_id;

  return v_session_id;
end;
$$;

create or replace function public.sync_map_vote_session(
  p_session_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.map_vote_sessions%rowtype;
begin
  select *
  into v_session
  from public.map_vote_sessions
  where id = p_session_id;

  if not found then
    raise exception 'Map vote session not found';
  end if;

  if v_session.status = 'active' and v_session.turn_ends_at is not null and v_session.turn_ends_at <= now() then
    perform public.advance_map_vote_round(v_session.id, null);
  end if;
end;
$$;

create or replace function public.cast_lobby_map_vote(
  p_session_id uuid,
  p_map_code text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_session public.map_vote_sessions%rowtype;
  v_team_side public.ha_team_side;
  v_votes_for_map integer;
  v_active_team_size integer;
  v_threshold integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  perform public.sync_map_vote_session(p_session_id);

  select *
  into v_session
  from public.map_vote_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'Map vote session not found';
  end if;

  if v_session.status <> 'active' then
    raise exception 'This map vote session is not active';
  end if;

  if not (p_map_code = any(v_session.remaining_maps)) then
    raise exception 'This map is no longer available';
  end if;

  select lm.team_side
  into v_team_side
  from public.lobby_members lm
  where lm.lobby_id = v_session.lobby_id
    and lm.user_id = v_user_id
    and lm.kicked_at is null
    and lm.left_at is null;

  if not found then
    raise exception 'You are not an active member of this lobby';
  end if;

  if v_team_side <> v_session.active_team then
    raise exception 'It is not your team''s turn to veto';
  end if;

  insert into public.map_votes (session_id, user_id, map_code, updated_at)
  values (p_session_id, v_user_id, p_map_code, now())
  on conflict (session_id, user_id) do update
  set map_code = excluded.map_code,
      updated_at = now();

  select count(*)
  into v_votes_for_map
  from public.map_votes mv
  join public.lobby_members lm
    on lm.lobby_id = v_session.lobby_id
   and lm.user_id = mv.user_id
   and lm.kicked_at is null
   and lm.left_at is null
   and lm.team_side = v_session.active_team
  where mv.session_id = p_session_id
    and mv.map_code = p_map_code;

  select count(*)
  into v_active_team_size
  from public.lobby_members
  where lobby_id = v_session.lobby_id
    and team_side = v_session.active_team
    and kicked_at is null
    and left_at is null;

  v_threshold := greatest(1, least(2, v_active_team_size));

  if v_votes_for_map >= v_threshold then
    perform public.advance_map_vote_round(p_session_id, p_map_code);
  end if;
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
  v_current_side public.ha_team_side;
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

  select team_side
  into v_current_side
  from public.lobby_members
  where lobby_id = p_lobby_id
    and user_id = v_user_id
    and kicked_at is null
    and left_at is null
  for update;

  if not found then
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
    and user_id = v_user_id;
end;
$$;

create or replace function public.send_lobby_message(
  p_lobby_id uuid,
  p_message text
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_message_id bigint;
  v_clean_message text := nullif(trim(coalesce(p_message, '')), '');
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if v_clean_message is null then
    raise exception 'Message cannot be empty';
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

  insert into public.lobby_messages (lobby_id, user_id, message)
  values (p_lobby_id, v_user_id, v_clean_message)
  returning id into v_message_id;

  return v_message_id;
end;
$$;

create or replace function public.create_matchmaking_lobby(
  p_mode public.ha_mode,
  p_kind public.ha_lobby_kind,
  p_name text,
  p_team_size integer default 5,
  p_game_mode text default 'competitive',
  p_stake_amount numeric default 0,
  p_selected_map text default null,
  p_password text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_lobby_id uuid;
  v_safe_stake numeric(14,2) := greatest(coalesce(p_stake_amount, 0), 0);
  v_password_hash text;
  v_game_mode text := lower(coalesce(nullif(trim(p_game_mode), ''), 'competitive'));
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_team_size not in (2, 5) then
    raise exception 'Only 2v2 and 5v5 custom lobbies are supported';
  end if;

  if p_team_size = 2 and v_game_mode <> 'wingman' then
    raise exception '2v2 lobbies only support Wingman mode';
  end if;

  if p_team_size = 5 and v_game_mode not in ('competitive', 'team_ffa', 'ffa') then
    raise exception '5v5 lobbies support Competitive, Team FFA, or FFA';
  end if;

  perform public.assert_user_can_access_mode(v_user_id, p_mode);

  if exists (
    select 1
    from public.lobby_members lm
    join public.lobbies l on l.id = lm.lobby_id
    where lm.user_id = v_user_id
      and lm.kicked_at is null
      and lm.left_at is null
      and l.status in ('open', 'in_progress')
  ) then
    raise exception 'Leave your current lobby before creating a new one';
  end if;

  if p_mode = 'demo' then
    v_safe_stake := 0;
  end if;

  if nullif(trim(coalesce(p_password, '')), '') is not null then
    v_password_hash := crypt(trim(p_password), gen_salt('bf'));
  else
    v_password_hash := null;
  end if;

  insert into public.lobbies (
    mode,
    kind,
    name,
    leader_id,
    status,
    stake_amount,
    team_size,
    game_mode,
    selected_map,
    password_hash,
    password_required,
    map_voting_active
  ) values (
    p_mode,
    p_kind,
    coalesce(nullif(trim(p_name), ''), case when p_mode = 'demo' then 'Demo Custom Lobby' else 'Live Custom Lobby' end),
    v_user_id,
    'open',
    v_safe_stake,
    p_team_size,
    v_game_mode,
    p_selected_map,
    v_password_hash,
    v_password_hash is not null,
    false
  )
  returning id into v_lobby_id;

  insert into public.lobby_members (lobby_id, user_id, team_side, is_ready)
  values (v_lobby_id, v_user_id, 'UNASSIGNED', false);

  return v_lobby_id;
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
declare
  v_actor_id uuid := auth.uid();
  v_actor_role public.ha_role;
  v_lobby public.lobbies%rowtype;
  v_match_id uuid;
  v_active_members integer;
  v_ready_members integer;
  v_t_members integer;
  v_ct_members integer;
begin
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
    raise exception 'Only the lobby leader or an admin can start the match';
  end if;

  if v_lobby.status <> 'open' then
    raise exception 'This lobby has already been started or closed';
  end if;

  if coalesce(v_lobby.selected_map, '') = '' then
    raise exception 'Finish map veto before starting the match';
  end if;

  select
    count(*) filter (where kicked_at is null and left_at is null),
    count(*) filter (where kicked_at is null and left_at is null and is_ready),
    count(*) filter (where kicked_at is null and left_at is null and team_side = 'T'),
    count(*) filter (where kicked_at is null and left_at is null and team_side = 'CT')
  into v_active_members, v_ready_members, v_t_members, v_ct_members
  from public.lobby_members
  where lobby_id = p_lobby_id;

  if v_active_members <> v_lobby.max_players then
    raise exception 'The lobby must be full before starting the match';
  end if;

  if v_ready_members <> v_active_members then
    raise exception 'Every player must ready up before the match can start';
  end if;

  if v_t_members <> v_lobby.team_size or v_ct_members <> v_lobby.team_size then
    raise exception 'Both teams must be filled before the match can start';
  end if;

  insert into public.matches (lobby_id, mode, status, started_at, dedicated_server_id)
  values (
    v_lobby.id,
    v_lobby.mode,
    'live',
    now(),
    'pending-allocation'
  )
  returning id into v_match_id;

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

  update public.lobbies
  set status = 'in_progress',
      map_voting_active = false,
      join_server_deadline = now() + interval '3 minutes',
      updated_at = now()
  where id = p_lobby_id;

  return v_match_id;
end;
$$;

drop policy if exists map_vote_sessions_select_all on public.map_vote_sessions;
create policy map_vote_sessions_select_all on public.map_vote_sessions
for select using (true);

drop policy if exists map_votes_select_all on public.map_votes;
create policy map_votes_select_all on public.map_votes
for select using (true);
