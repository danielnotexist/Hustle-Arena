-- 20260405_0014_cs2_server_bootstrap_contract.sql

create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;

create table if not exists private.lobby_server_secrets (
  lobby_id uuid primary key references public.lobbies(id) on delete cascade,
  server_password text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.matches
  add column if not exists game_key text not null default 'cs2';

alter table public.matches
  add column if not exists server_status text not null default 'awaiting_allocation';

alter table public.matches
  add column if not exists server_provider text;

alter table public.matches
  add column if not exists server_config jsonb not null default '{}'::jsonb;

create or replace function public.build_cs2_server_config(
  p_match_id uuid,
  p_lobby_id uuid,
  p_lobby_name text,
  p_mode public.ha_mode,
  p_game_mode text,
  p_selected_map text,
  p_team_size integer,
  p_max_players integer,
  p_stake_amount numeric,
  p_server_password text default null
)
returns jsonb
language plpgsql
stable
as $$
begin
  return jsonb_build_object(
    'game', 'counter-strike-2',
    'gameKey', 'cs2',
    'matchId', p_match_id,
    'lobbyId', p_lobby_id,
    'lobbyName', p_lobby_name,
    'environment', p_mode,
    'playlist', coalesce(p_game_mode, 'competitive'),
    'selectedMap', p_selected_map,
    'teamSize', p_team_size,
    'maxPlayers', p_max_players,
    'stakeAmountUsdt', coalesce(p_stake_amount, 0),
    'passwordRequired', p_server_password is not null,
    'serverPassword', p_server_password,
    'launchPolicy', jsonb_build_object(
      'waitForAllPlayers', true,
      'autoCloseOnMatchEnd', true,
      'allowReconnect', true
    ),
    'telemetry', jsonb_build_object(
      'ingestRoundStats', true,
      'ingestPlayerStats', true,
      'ingestMatchOutcome', true
    )
  );
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
set search_path = public, private
as $$
declare
  v_user_id uuid := auth.uid();
  v_lobby_id uuid;
  v_safe_stake numeric(14,2) := greatest(coalesce(p_stake_amount, 0), 0);
  v_password_hash text;
  v_password_plaintext text := nullif(trim(coalesce(p_password, '')), '');
  v_game_mode text := lower(coalesce(nullif(trim(p_game_mode), ''), 'competitive'));
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_team_size not in (2, 5) then
    raise exception 'Only 2v2 and 5v5 custom lobbies are supported';
  end if;

  if p_team_size = 2 and v_game_mode <> 'wingman' then
    raise exception '2v2 CS2 lobbies only support Wingman mode';
  end if;

  if p_team_size = 5 and v_game_mode not in ('competitive', 'team_ffa', 'ffa') then
    raise exception '5v5 CS2 lobbies support Competitive, Team FFA, or FFA';
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

  if v_password_plaintext is not null then
    v_password_hash := crypt(v_password_plaintext, gen_salt('bf'));
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
    coalesce(nullif(trim(p_name), ''), case when p_mode = 'demo' then 'CS2 Demo Custom Lobby' else 'CS2 Live Custom Lobby' end),
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

  insert into private.lobby_server_secrets (lobby_id, server_password)
  values (v_lobby_id, v_password_plaintext)
  on conflict (lobby_id) do update
  set server_password = excluded.server_password,
      updated_at = now();

  return v_lobby_id;
end;
$$;

create or replace function public.ensure_pending_lobby_match(
  p_lobby_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_lobby public.lobbies%rowtype;
  v_match_id uuid;
  v_server_password text;
  v_server_config jsonb;
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
    raise exception 'A final map must be selected before preparing the CS2 server';
  end if;

  select server_password
  into v_server_password
  from private.lobby_server_secrets
  where lobby_id = p_lobby_id;

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
      dedicated_server_endpoint,
      game_key,
      server_status,
      server_provider
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
      ),
      'cs2',
      'awaiting_allocation',
      'future-vps-worker'
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

  v_server_config := public.build_cs2_server_config(
    v_match_id,
    v_lobby.id,
    v_lobby.name,
    v_lobby.mode,
    v_lobby.game_mode,
    v_lobby.selected_map,
    v_lobby.team_size,
    v_lobby.max_players,
    v_lobby.stake_amount,
    v_server_password
  );

  update public.matches
  set server_config = v_server_config,
      game_key = 'cs2',
      server_status = case when dedicated_server_id = 'pending-allocation' then 'awaiting_allocation' else server_status end,
      server_provider = coalesce(server_provider, 'future-vps-worker')
  where id = v_match_id;

  return v_match_id;
end;
$$;

create or replace function public.get_match_server_bootstrap(
  p_match_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_role public.ha_role;
  v_payload jsonb;
begin
  if auth.role() <> 'service_role' then
    select role into v_actor_role from public.profiles where id = v_actor_id;
    if v_actor_role is distinct from 'admin' then
      raise exception 'Only admins or the service role can fetch server bootstrap payloads';
    end if;
  end if;

  select server_config
  into v_payload
  from public.matches
  where id = p_match_id;

  if v_payload is null then
    raise exception 'Match bootstrap payload not found';
  end if;

  return v_payload;
end;
$$;

create or replace function public.mark_match_server_allocated(
  p_match_id uuid,
  p_server_id text,
  p_server_endpoint text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_role public.ha_role;
begin
  if auth.role() <> 'service_role' then
    select role into v_actor_role from public.profiles where id = v_actor_id;
    if v_actor_role is distinct from 'admin' then
      raise exception 'Only admins or the service role can assign CS2 servers';
    end if;
  end if;

  update public.matches
  set dedicated_server_id = coalesce(nullif(trim(coalesce(p_server_id, '')), ''), dedicated_server_id),
      dedicated_server_endpoint = coalesce(nullif(trim(coalesce(p_server_endpoint, '')), ''), dedicated_server_endpoint),
      server_status = 'allocated',
      server_provider = coalesce(server_provider, 'future-vps-worker')
  where id = p_match_id;

  if not found then
    raise exception 'Match not found';
  end if;
end;
$$;
