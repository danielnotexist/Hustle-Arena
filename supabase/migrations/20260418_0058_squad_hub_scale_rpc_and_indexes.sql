-- 20260418_0058_squad_hub_scale_rpc_and_indexes.sql
-- Add lighter Squad Hub data paths for browser-scale lobby discovery and
-- a single active-lobby snapshot RPC for the real-time control room.

create extension if not exists pg_trgm;

create index if not exists idx_lobbies_custom_open_mode_created
  on public.lobbies(mode, created_at desc)
  where kind = 'custom' and status = 'open';

create index if not exists idx_lobby_members_active_user_lookup
  on public.lobby_members(user_id, lobby_id)
  where left_at is null and kicked_at is null;

create index if not exists idx_lobby_members_active_lobby_lookup
  on public.lobby_members(lobby_id, team_side, is_ready)
  where left_at is null and kicked_at is null;

create index if not exists idx_matches_active_lobby_created
  on public.matches(lobby_id, created_at desc)
  where status in ('pending', 'live');

create index if not exists idx_matches_recent_by_mode
  on public.matches(mode, created_at desc)
  where status in ('finished', 'cancelled', 'interrupted');

create index if not exists idx_lobby_messages_lobby_created_desc
  on public.lobby_messages(lobby_id, created_at desc);

create index if not exists idx_map_votes_session_updated_desc
  on public.map_votes(session_id, updated_at desc);

create index if not exists idx_lobbies_name_trgm
  on public.lobbies using gin (lower(name) gin_trgm_ops);

create index if not exists idx_profiles_username_trgm
  on public.profiles using gin (lower(username) gin_trgm_ops);

create or replace function public.get_matchmaking_browser_lobbies(
  p_mode public.ha_mode,
  p_limit integer default 50,
  p_search text default null,
  p_before_created_at timestamptz default null,
  p_before_lobby_id uuid default null
)
returns table (
  id uuid,
  mode public.ha_mode,
  kind public.ha_lobby_kind,
  name text,
  leader_id uuid,
  leader_username text,
  leader_avatar_url text,
  status public.ha_lobby_status,
  stake_amount numeric,
  team_size integer,
  max_players integer,
  game_mode text,
  password_required boolean,
  selected_map text,
  map_voting_active boolean,
  auto_veto_starts_at timestamptz,
  join_server_deadline timestamptz,
  created_at timestamptz,
  player_count integer,
  ready_count integer,
  t_count integer,
  ct_count integer
)
language sql
security definer
set search_path = public
as $$
  with filtered_lobbies as (
    select
      l.*
    from public.lobbies l
    left join public.profiles leader on leader.id = l.leader_id
    where l.mode = p_mode
      and l.kind = 'custom'
      and l.status = 'open'
      and (
        nullif(trim(coalesce(p_search, '')), '') is null
        or lower(l.name) like '%' || lower(trim(p_search)) || '%'
        or lower(coalesce(leader.username, '')) like '%' || lower(trim(p_search)) || '%'
      )
      and (
        p_before_created_at is null
        or l.created_at < p_before_created_at
        or (l.created_at = p_before_created_at and p_before_lobby_id is not null and l.id < p_before_lobby_id)
      )
    order by l.created_at desc, l.id desc
    limit least(greatest(coalesce(p_limit, 50), 1), 100)
  )
  select
    l.id,
    l.mode,
    l.kind,
    l.name,
    l.leader_id,
    leader.username as leader_username,
    leader.avatar_url as leader_avatar_url,
    l.status,
    l.stake_amount,
    l.team_size,
    l.max_players,
    l.game_mode,
    l.password_required,
    l.selected_map,
    l.map_voting_active,
    l.auto_veto_starts_at,
    l.join_server_deadline,
    l.created_at,
    coalesce(stats.player_count, 0)::integer as player_count,
    coalesce(stats.ready_count, 0)::integer as ready_count,
    coalesce(stats.t_count, 0)::integer as t_count,
    coalesce(stats.ct_count, 0)::integer as ct_count
  from filtered_lobbies l
  left join public.profiles leader on leader.id = l.leader_id
  left join lateral (
    select
      count(*) filter (where lm.left_at is null and lm.kicked_at is null) as player_count,
      count(*) filter (where lm.left_at is null and lm.kicked_at is null and lm.is_ready) as ready_count,
      count(*) filter (where lm.left_at is null and lm.kicked_at is null and lm.team_side = 'T') as t_count,
      count(*) filter (where lm.left_at is null and lm.kicked_at is null and lm.team_side = 'CT') as ct_count
    from public.lobby_members lm
    where lm.lobby_id = l.id
  ) stats on true
  where coalesce(stats.player_count, 0) > 0
  order by l.created_at desc, l.id desc;
$$;

grant execute on function public.get_matchmaking_browser_lobbies(public.ha_mode, integer, text, timestamptz, uuid) to authenticated;

create or replace function public.get_my_active_lobby_summary(
  p_mode public.ha_mode
)
returns table (
  id uuid,
  mode public.ha_mode,
  kind public.ha_lobby_kind,
  status public.ha_lobby_status,
  team_size integer,
  game_mode text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    l.id,
    l.mode,
    l.kind,
    l.status,
    l.team_size,
    l.game_mode,
    l.created_at
  from public.lobbies l
  join public.lobby_members lm
    on lm.lobby_id = l.id
   and lm.user_id = auth.uid()
   and lm.left_at is null
   and lm.kicked_at is null
  where l.mode = p_mode
    and l.status in ('open', 'in_progress')
  order by
    case when l.status = 'in_progress' then 0 else 1 end,
    l.created_at desc,
    l.id desc
  limit 1;
$$;

grant execute on function public.get_my_active_lobby_summary(public.ha_mode) to authenticated;

create or replace function public.get_my_squad_hub_state(
  p_mode public.ha_mode
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_lobby_id uuid;
  v_state jsonb := jsonb_build_object('lobby', null, 'match', null);
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select l.id
  into v_lobby_id
  from public.lobbies l
  join public.lobby_members lm
    on lm.lobby_id = l.id
   and lm.user_id = v_user_id
   and lm.left_at is null
   and lm.kicked_at is null
  where l.mode = p_mode
    and l.status in ('open', 'in_progress')
  order by
    case when l.status = 'in_progress' then 0 else 1 end,
    l.created_at desc,
    l.id desc
  limit 1;

  if v_lobby_id is null then
    return v_state;
  end if;

  select
    jsonb_build_object(
      'lobby',
      jsonb_build_object(
        'id', l.id,
        'mode', l.mode,
        'kind', l.kind,
        'name', l.name,
        'leader_id', l.leader_id,
        'status', l.status,
        'stake_amount', l.stake_amount,
        'team_size', l.team_size,
        'max_players', l.max_players,
        'game_mode', l.game_mode,
        'password_required', l.password_required,
        'selected_map', l.selected_map,
        'map_voting_active', l.map_voting_active,
        'auto_veto_starts_at', l.auto_veto_starts_at,
        'join_server_deadline', l.join_server_deadline,
        'created_at', l.created_at,
        'lobby_members', coalesce(member_data.members_json, '[]'::jsonb),
        'lobby_messages', coalesce(message_data.messages_json, '[]'::jsonb),
        'map_vote_sessions', coalesce(vote_session_data.sessions_json, '[]'::jsonb)
      ),
      'match',
      match_data.match_json
    )
  into v_state
  from public.lobbies l
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'user_id', lm.user_id,
        'team_side', lm.team_side,
        'is_ready', lm.is_ready,
        'joined_at', lm.joined_at,
        'left_at', lm.left_at,
        'kicked_at', lm.kicked_at,
        'profiles', jsonb_build_object(
          'username', p.username,
          'email', p.email,
          'avatar_url', p.avatar_url
        )
      )
      order by lm.joined_at asc, lm.user_id asc
    ) as members_json
    from public.lobby_members lm
    join public.profiles p on p.id = lm.user_id
    where lm.lobby_id = l.id
      and lm.left_at is null
      and lm.kicked_at is null
  ) member_data on true
  left join lateral (
    select jsonb_agg(message_row.message_json order by message_row.created_at asc, message_row.id asc) as messages_json
    from (
      select
        lm.id,
        lm.created_at,
        jsonb_build_object(
          'id', lm.id,
          'user_id', lm.user_id,
          'message', lm.message,
          'created_at', lm.created_at,
          'profiles', jsonb_build_object(
            'username', p.username
          )
        ) as message_json
      from public.lobby_messages lm
      join public.profiles p on p.id = lm.user_id
      where lm.lobby_id = l.id
      order by lm.created_at desc, lm.id desc
      limit 100
    ) message_row
  ) message_data on true
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'id', mvs.id,
        'lobby_id', mvs.lobby_id,
        'active_team', mvs.active_team,
        'turn_ends_at', mvs.turn_ends_at,
        'turn_seconds', mvs.turn_seconds,
        'remaining_maps', to_jsonb(mvs.remaining_maps),
        'status', mvs.status,
        'round_number', mvs.round_number,
        'last_vetoed_map', mvs.last_vetoed_map,
        'updated_at', mvs.updated_at,
        'map_votes', coalesce(vote_data.votes_json, '[]'::jsonb)
      )
      order by
        case when mvs.status = 'active' then 0 else 1 end,
        mvs.updated_at desc,
        mvs.id desc
    ) as sessions_json
    from public.map_vote_sessions mvs
    left join lateral (
      select jsonb_agg(
        jsonb_build_object(
          'user_id', mv.user_id,
          'map_code', mv.map_code,
          'updated_at', mv.updated_at
        )
        order by mv.updated_at desc, mv.user_id asc
      ) as votes_json
      from public.map_votes mv
      where mv.session_id = mvs.id
    ) vote_data on true
    where mvs.lobby_id = l.id
  ) vote_session_data on true
  left join lateral (
    select jsonb_build_object(
      'id', m.id,
      'lobby_id', m.lobby_id,
      'mode', m.mode,
      'status', m.status,
      'dedicated_server_endpoint', m.dedicated_server_endpoint,
      'started_at', m.started_at,
      'ended_at', m.ended_at,
      'match_players', coalesce(player_data.players_json, '[]'::jsonb)
    ) as match_json
    from public.matches m
    left join lateral (
      select jsonb_agg(
        jsonb_build_object(
          'user_id', mp.user_id,
          'team_side', mp.team_side,
          'joined_server', mp.joined_server,
          'is_winner', mp.is_winner,
          'round_score', mp.round_score,
          'kills', mp.kills,
          'deaths', mp.deaths,
          'assists', mp.assists,
          'payout_amount', mp.payout_amount,
          'profiles', jsonb_build_object(
            'username', p.username
          )
        )
        order by mp.user_id asc
      ) as players_json
      from public.match_players mp
      join public.profiles p on p.id = mp.user_id
      where mp.match_id = m.id
    ) player_data on true
    where m.lobby_id = l.id
      and m.status in ('pending', 'live')
    order by m.created_at desc
    limit 1
  ) match_data on true
  where l.id = v_lobby_id;

  return coalesce(v_state, jsonb_build_object('lobby', null, 'match', null));
end;
$$;

grant execute on function public.get_my_squad_hub_state(public.ha_mode) to authenticated;
