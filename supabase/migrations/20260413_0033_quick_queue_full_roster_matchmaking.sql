create or replace function public.quick_queue_join_or_match(
  p_mode public.ha_mode,
  p_team_size integer,
  p_queue_mode text default 'solo'
)
returns table (
  status text,
  lobby_id uuid,
  players_joined integer,
  players_needed integer,
  estimated_wait_seconds integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_queue_mode text := coalesce(nullif(trim(lower(p_queue_mode)), ''), 'solo');
  v_required_players integer := p_team_size * 2;
  v_active_lobby public.lobbies%rowtype;
  v_target_lobby public.lobbies%rowtype;
  v_players_joined integer := 0;
  v_queue_position integer := 1;
  v_selected_user_ids uuid[];
  v_selected_count integer := 0;
  v_owner_user_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_team_size not in (2, 5) then
    raise exception 'Quick queue supports only 2v2 or 5v5';
  end if;

  if v_queue_mode not in ('solo', 'party') then
    raise exception 'Quick queue mode must be solo or party';
  end if;

  perform public.assert_user_can_access_mode(v_user_id, p_mode);

  select l.*
  into v_active_lobby
  from public.lobby_members lm
  join public.lobbies l on l.id = lm.lobby_id
  where lm.user_id = v_user_id
    and lm.kicked_at is null
    and lm.left_at is null
    and l.mode = p_mode
    and l.team_size = p_team_size
    and l.status in ('open', 'in_progress')
  order by l.created_at asc
  limit 1;

  if found then
    select count(*)
    into v_players_joined
    from public.lobby_members lm
    where lm.lobby_id = v_active_lobby.id
      and lm.kicked_at is null
      and lm.left_at is null;

    insert into public.quick_queue_entries (user_id, mode, team_size, queue_mode, status, matched_lobby_id, updated_at)
    values (
      v_user_id,
      p_mode,
      p_team_size,
      v_queue_mode,
      case when v_players_joined >= v_active_lobby.max_players then 'matched' else 'searching' end,
      case when v_players_joined >= v_active_lobby.max_players then v_active_lobby.id else null end,
      now()
    )
    on conflict (user_id) do update
    set mode = excluded.mode,
        team_size = excluded.team_size,
        queue_mode = excluded.queue_mode,
        status = excluded.status,
        matched_lobby_id = excluded.matched_lobby_id,
        updated_at = now();

    return query
    select
      case when v_players_joined >= v_active_lobby.max_players then 'matched' else 'searching' end,
      v_active_lobby.id,
      v_players_joined,
      greatest(v_active_lobby.max_players - v_players_joined, 0),
      greatest(10, greatest(v_active_lobby.max_players - v_players_joined, 0) * 12);
    return;
  end if;

  insert into public.quick_queue_entries (user_id, mode, team_size, queue_mode, status, matched_lobby_id, updated_at)
  values (
    v_user_id,
    p_mode,
    p_team_size,
    v_queue_mode,
    'searching',
    null,
    now()
  )
  on conflict (user_id) do update
  set mode = excluded.mode,
      team_size = excluded.team_size,
      queue_mode = excluded.queue_mode,
      status = 'searching',
      matched_lobby_id = null,
      updated_at = now();

  with queued_players as (
    select q.user_id, q.created_at
    from public.quick_queue_entries q
    where q.mode = p_mode
      and q.team_size = p_team_size
      and q.queue_mode = v_queue_mode
      and q.status = 'searching'
    order by q.created_at asc
    for update skip locked
    limit v_required_players
  )
  select coalesce(array_agg(user_id order by created_at), '{}'::uuid[]), count(*)
  into v_selected_user_ids, v_selected_count
  from queued_players;

  if v_selected_count = v_required_players then
    v_owner_user_id := v_selected_user_ids[1 + floor(random() * v_required_players)::integer];

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
      'public',
      case when p_team_size = 2 then 'Quick Queue Wingman' else 'Quick Queue Competitive' end,
      v_owner_user_id,
      'open',
      0,
      p_team_size,
      case when p_team_size = 2 then 'wingman' else 'competitive' end,
      null,
      null,
      false,
      false
    )
    returning * into v_target_lobby;

    insert into public.lobby_members (lobby_id, user_id, team_side, is_ready)
    select v_target_lobby.id, queued_user_id, 'UNASSIGNED', false
    from unnest(v_selected_user_ids) as queued_user_id
    on conflict (lobby_id, user_id) do update
    set team_side = 'UNASSIGNED',
        is_ready = false,
        joined_at = now(),
        left_at = null,
        kicked_at = null;

    update public.quick_queue_entries
    set status = 'matched',
        matched_lobby_id = v_target_lobby.id,
        updated_at = now()
    where user_id = any(v_selected_user_ids);

    return query
    select
      'matched'::text,
      v_target_lobby.id,
      v_required_players,
      0,
      0;
    return;
  end if;

  select count(*) + 1
  into v_queue_position
  from public.quick_queue_entries q
  where q.mode = p_mode
    and q.team_size = p_team_size
    and q.queue_mode = v_queue_mode
    and q.status = 'searching'
    and q.created_at < (
      select created_at
      from public.quick_queue_entries
      where user_id = v_user_id
    );

  return query
  select
    'searching'::text,
    null::uuid,
    greatest(v_selected_count, 1),
    greatest(v_required_players - greatest(v_selected_count, 1), 0),
    greatest(8, v_queue_position * 6);
end;
$$;

grant execute on function public.quick_queue_join_or_match(public.ha_mode, integer, text) to authenticated;
