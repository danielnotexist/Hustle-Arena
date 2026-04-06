-- 20260406_0015_demo_custom_lobby_stakes.sql

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
