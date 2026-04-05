-- 20260405_0010_battlefield_demo_flow.sql

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
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  update public.lobby_members
  set left_at = now(),
      is_ready = false
  where lobby_id = p_lobby_id
    and user_id = v_user_id
    and kicked_at is null
    and left_at is null;

  if not found then
    raise exception 'You are not an active member of this lobby';
  end if;
end;
$$;

create or replace function public.complete_demo_match_for_testing(
  p_match_id uuid,
  p_winning_side public.ha_team_side default 'T'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_role public.ha_role;
  v_match public.matches%rowtype;
  v_lobby public.lobbies%rowtype;
  v_player record;
  v_index integer := 0;
  v_demo_stats jsonb;
  v_new_level integer;
  v_new_win_rate text;
  v_new_kd_ratio numeric(10,2);
  v_new_headshot_pct text;
  v_new_performance jsonb;
  v_is_winner boolean;
  v_kills integer;
  v_deaths integer;
  v_assists integer;
  v_round_score integer;
begin
  select role into v_actor_role from public.profiles where id = v_actor_id;

  select *
  into v_match
  from public.matches
  where id = p_match_id
  for update;

  if not found then
    raise exception 'Match not found';
  end if;

  if v_match.mode <> 'demo' then
    raise exception 'This helper only supports demo matches';
  end if;

  if v_match.status <> 'live' then
    raise exception 'Only live demo matches can be completed through testing';
  end if;

  select *
  into v_lobby
  from public.lobbies
  where id = v_match.lobby_id;

  if not found then
    raise exception 'Lobby not found for the match';
  end if;

  if v_lobby.leader_id <> v_actor_id and v_actor_role is distinct from 'admin' then
    raise exception 'Only the lobby leader or an admin can complete a demo test match';
  end if;

  for v_player in
    select mp.user_id, mp.team_side
    from public.match_players mp
    where mp.match_id = p_match_id
    order by mp.user_id
  loop
    v_index := v_index + 1;
    v_is_winner := v_player.team_side = p_winning_side;
    v_kills := case when v_is_winner then 18 + (v_index % 7) else 8 + (v_index % 5) end;
    v_deaths := case when v_is_winner then 10 + (v_index % 4) else 15 + (v_index % 6) end;
    v_assists := 4 + (v_index % 6);
    v_round_score := case when v_is_winner then 95 + (v_index * 4) else 55 + (v_index * 3) end;

    update public.match_players
    set kills = v_kills,
        deaths = v_deaths,
        assists = v_assists,
        round_score = v_round_score,
        is_winner = v_is_winner,
        joined_server = true,
        joined_server_at = coalesce(joined_server_at, now())
    where match_id = p_match_id
      and user_id = v_player.user_id;

    select coalesce(demo_stats, '{}'::jsonb)
    into v_demo_stats
    from public.profiles
    where id = v_player.user_id
    for update;

    v_new_level := greatest(coalesce((v_demo_stats ->> 'level')::integer, 1), 1) + case when v_is_winner then 1 else 0 end;
    v_new_win_rate := case when v_is_winner then '100%' else coalesce(v_demo_stats ->> 'winRate', '0%') end;
    v_new_kd_ratio := round((greatest(v_kills, 0)::numeric / greatest(v_deaths, 1)::numeric), 2);
    v_new_headshot_pct := case when v_kills > 0 then '35%' else '0%' end;
    v_new_performance := public.append_recent_performance_score(
      coalesce(v_demo_stats -> 'performance', '[0,0,0,0,0,0,0,0,0,0]'::jsonb),
      v_round_score
    );

    update public.profiles
    set demo_stats = jsonb_build_object(
      'level', v_new_level,
      'rank', case when v_is_winner then 'Demo Vanguard' else coalesce(v_demo_stats ->> 'rank', 'Demo Cadet') end,
      'winRate', v_new_win_rate,
      'kdRatio', v_new_kd_ratio,
      'headshotPct', v_new_headshot_pct,
      'performance', v_new_performance
    ),
        updated_at = now()
    where id = v_player.user_id;

    perform public.create_notification(
      v_player.user_id,
      'demo_match_completed',
      'Demo match completed',
      'Your demo match finished and your demo combat record was updated.',
      '/battlefield',
      jsonb_build_object('match_id', p_match_id, 'winner', v_is_winner)
    );
  end loop;

  update public.matches
  set status = 'finished',
      ended_at = now()
  where id = p_match_id;

  update public.lobbies
  set status = 'closed',
      close_reason = 'Demo test match completed',
      updated_at = now()
  where id = v_match.lobby_id;
end;
$$;
