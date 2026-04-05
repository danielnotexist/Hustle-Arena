-- 20260405_0009_mode_isolated_match_domain.sql

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'lobbies_demo_stake_zero_check'
  ) then
    alter table public.lobbies
      add constraint lobbies_demo_stake_zero_check
      check (mode = 'live' or stake_amount = 0);
  end if;
end $$;

create or replace function public.assert_user_can_access_mode(
  p_user_id uuid,
  p_mode public.ha_mode
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
    raise exception 'Profile not found for the active user';
  end if;

  if coalesce(v_profile.account_mode, 'live') <> p_mode::text then
    raise exception 'Switch your account mode to % before using this queue', p_mode;
  end if;

  if p_mode = 'live' and v_profile.kyc_status <> 'verified' then
    raise exception 'KYC verification is required for live-stakes matchmaking';
  end if;
end;
$$;

create or replace function public.create_matchmaking_lobby(
  p_mode public.ha_mode,
  p_kind public.ha_lobby_kind,
  p_name text,
  p_team_size integer default 5,
  p_game_mode text default 'standard',
  p_stake_amount numeric default 0,
  p_selected_map text default null
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
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  perform public.assert_user_can_access_mode(v_user_id, p_mode);

  if p_mode = 'demo' then
    v_safe_stake := 0;
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
    selected_map
  ) values (
    p_mode,
    p_kind,
    coalesce(nullif(trim(p_name), ''), case when p_mode = 'demo' then 'Demo Queue' else 'Live Queue' end),
    v_user_id,
    'open',
    v_safe_stake,
    p_team_size,
    p_game_mode,
    p_selected_map
  )
  returning id into v_lobby_id;

  insert into public.lobby_members (lobby_id, user_id, team_side, is_ready)
  values (v_lobby_id, v_user_id, 'UNASSIGNED', false);

  return v_lobby_id;
end;
$$;

create or replace function public.join_matchmaking_lobby(
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

  if v_lobby.status <> 'open' then
    raise exception 'Only open lobbies can be joined';
  end if;

  perform public.assert_user_can_access_mode(v_user_id, v_lobby.mode);

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
      joined_at = now();
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

  insert into public.matches (lobby_id, mode, status, started_at)
  values (v_lobby.id, v_lobby.mode, 'live', now())
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
    case when lm.rn <= v_lobby.team_size then 'T'::public.ha_team_side else 'CT'::public.ha_team_side end,
    false,
    null
  from (
    select
      lm.user_id,
      row_number() over (order by lm.joined_at asc, lm.user_id asc) as rn
    from public.lobby_members lm
    where lm.lobby_id = p_lobby_id
      and lm.kicked_at is null
      and lm.left_at is null
  ) lm;

  update public.lobby_members
  set team_side = case
    when numbered.rn <= v_lobby.team_size then 'T'::public.ha_team_side
    else 'CT'::public.ha_team_side
  end
  from (
    select
      lm.user_id,
      row_number() over (order by lm.joined_at asc, lm.user_id asc) as rn
    from public.lobby_members lm
    where lm.lobby_id = p_lobby_id
      and lm.kicked_at is null
      and lm.left_at is null
  ) numbered
  where public.lobby_members.lobby_id = p_lobby_id
    and public.lobby_members.user_id = numbered.user_id;

  update public.lobbies
  set status = 'in_progress',
      updated_at = now()
  where id = p_lobby_id;

  return v_match_id;
end;
$$;

create or replace function public.append_recent_performance_score(
  p_existing jsonb,
  p_score integer
)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_scores integer[];
begin
  v_scores := array_append(
    coalesce((
      select array_agg(value::integer)
      from jsonb_array_elements_text(coalesce(p_existing, '[0,0,0,0,0,0,0,0,0,0]'::jsonb))
    ), array[]::integer[]),
    greatest(coalesce(p_score, 0), 0)
  );

  if array_length(v_scores, 1) > 10 then
    v_scores := v_scores[array_length(v_scores, 1) - 9:array_length(v_scores, 1)];
  end if;

  return to_jsonb(v_scores);
end;
$$;

create or replace function public.admin_record_match_player_stats(
  p_match_id uuid,
  p_user_id uuid,
  p_team_side public.ha_team_side,
  p_kills integer,
  p_deaths integer,
  p_assists integer,
  p_round_score integer,
  p_is_winner boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
  v_admin_role public.ha_role;
  v_match public.matches%rowtype;
  v_existing public.match_players%rowtype;
  v_demo_stats jsonb;
  v_new_level integer;
  v_new_win_rate text;
  v_new_kd_ratio numeric(10,2);
  v_new_headshot_pct text;
  v_new_performance jsonb;
begin
  select role into v_admin_role from public.profiles where id = v_admin_id;
  if v_admin_role is distinct from 'admin' then
    raise exception 'Only admins can record match player stats';
  end if;

  select *
  into v_match
  from public.matches
  where id = p_match_id;

  if not found then
    raise exception 'Match not found';
  end if;

  select *
  into v_existing
  from public.match_players
  where match_id = p_match_id
    and user_id = p_user_id
  for update;

  if not found then
    raise exception 'Match player row not found';
  end if;

  update public.match_players
  set team_side = p_team_side,
      kills = greatest(coalesce(p_kills, 0), 0),
      deaths = greatest(coalesce(p_deaths, 0), 0),
      assists = greatest(coalesce(p_assists, 0), 0),
      round_score = coalesce(p_round_score, 0),
      is_winner = p_is_winner
  where match_id = p_match_id
    and user_id = p_user_id;

  if v_match.mode = 'demo' then
    select coalesce(demo_stats, '{}'::jsonb)
    into v_demo_stats
    from public.profiles
    where id = p_user_id
    for update;

    v_new_level := greatest(coalesce((v_demo_stats ->> 'level')::integer, 1), 1) + case when p_is_winner then 1 else 0 end;
    v_new_win_rate := case when p_is_winner then '100%' else coalesce(v_demo_stats ->> 'winRate', '0%') end;
    v_new_kd_ratio := round((greatest(coalesce(p_kills, 0), 0)::numeric / greatest(coalesce(p_deaths, 0), 1)::numeric), 2);
    v_new_headshot_pct := case when coalesce(p_kills, 0) > 0 then '35%' else '0%' end;
    v_new_performance := public.append_recent_performance_score(
      coalesce(v_demo_stats -> 'performance', '[0,0,0,0,0,0,0,0,0,0]'::jsonb),
      greatest(coalesce(p_round_score, 0), 0)
    );

    update public.profiles
    set demo_stats = jsonb_build_object(
      'level', v_new_level,
      'rank', case when p_is_winner then 'Demo Vanguard' else coalesce(v_demo_stats ->> 'rank', 'Demo Cadet') end,
      'winRate', v_new_win_rate,
      'kdRatio', v_new_kd_ratio,
      'headshotPct', v_new_headshot_pct,
      'performance', v_new_performance
    ),
        updated_at = now()
    where id = p_user_id;
  else
    update public.profiles
    set level = greatest(level, 1) + case when p_is_winner then 1 else 0 end,
        rank = case when p_is_winner then 'Silver I' else rank end,
        win_rate = case when p_is_winner then '100%' else win_rate end,
        kd_ratio = round((greatest(coalesce(p_kills, 0), 0)::numeric / greatest(coalesce(p_deaths, 0), 1)::numeric), 2),
        headshot_pct = case when coalesce(p_kills, 0) > 0 then '35%' else headshot_pct end,
        performance = public.append_recent_performance_score(
          coalesce(performance, '[0,0,0,0,0,0,0,0,0,0]'::jsonb),
          greatest(coalesce(p_round_score, 0), 0)
        ),
        updated_at = now()
    where id = p_user_id;
  end if;
end;
$$;
