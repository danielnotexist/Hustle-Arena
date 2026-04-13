create or replace function public.quick_queue_accept_match(
  p_ready_check_id uuid,
  p_accept boolean default true
)
returns table (
  status text,
  lobby_id uuid,
  players_joined integer,
  players_needed integer,
  estimated_wait_seconds integer,
  ready_check_id uuid,
  accepted_count integer,
  participant_user_ids uuid[],
  accepted_user_ids uuid[]
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_user_id uuid := auth.uid();
  v_ready_check public.quick_queue_ready_checks%rowtype;
  v_required_players integer;
  v_owner_user_id uuid;
  v_lobby public.lobbies%rowtype;
  v_participant_ids uuid[] := '{}'::uuid[];
  v_accepted_ids uuid[] := '{}'::uuid[];
  v_accepted_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_ready_check
  from public.quick_queue_ready_checks rc
  where rc.id = p_ready_check_id
  for update;

  if not found then
    raise exception 'Ready check not found';
  end if;

  if not exists (
    select 1
    from public.quick_queue_ready_check_members m
    where m.ready_check_id = p_ready_check_id
      and m.user_id = v_user_id
  ) then
    raise exception 'You are not part of this ready check';
  end if;

  v_required_players := v_ready_check.team_size * 2;

  if v_ready_check.status <> 'pending' then
    if v_ready_check.status = 'completed' and v_ready_check.lobby_id is not null then
      select
        coalesce(array_agg(m.user_id order by m.created_at), '{}'::uuid[]),
        coalesce(array_agg(m.user_id order by m.created_at) filter (where m.accepted_at is not null), '{}'::uuid[]),
        count(*) filter (where m.accepted_at is not null)
      into v_participant_ids, v_accepted_ids, v_accepted_count
      from public.quick_queue_ready_check_members m
      where m.ready_check_id = p_ready_check_id;

      return query
      select
        'matched'::text,
        v_ready_check.lobby_id,
        v_required_players,
        0,
        0,
        v_ready_check.id,
        v_accepted_count,
        v_participant_ids,
        v_accepted_ids;
      return;
    end if;

    return query
    select
      'searching'::text,
      null::uuid,
      0,
      v_required_players,
      8,
      null::uuid,
      0,
      '{}'::uuid[],
      '{}'::uuid[];
    return;
  end if;

  if v_ready_check.expires_at <= now() then
    update public.quick_queue_ready_checks rc
    set status = 'expired'
    where rc.id = p_ready_check_id;

    update public.quick_queue_entries q
    set status = 'searching',
        matched_lobby_id = null,
        ready_check_id = null,
        updated_at = now()
    where q.ready_check_id = p_ready_check_id;

    return query
    select
      'searching'::text,
      null::uuid,
      0,
      v_required_players,
      8,
      null::uuid,
      0,
      '{}'::uuid[],
      '{}'::uuid[];
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext(format('quick-ready-check:%s', p_ready_check_id::text)));

  if not p_accept then
    update public.quick_queue_ready_checks rc
    set status = 'cancelled',
        completed_at = now()
    where rc.id = p_ready_check_id;

    update public.quick_queue_entries q
    set status = 'searching',
        matched_lobby_id = null,
        ready_check_id = null,
        updated_at = now()
    where q.ready_check_id = p_ready_check_id;

    update public.quick_queue_entries q
    set status = 'cancelled',
        updated_at = now()
    where q.user_id = v_user_id;

    return query
    select
      'searching'::text,
      null::uuid,
      0,
      v_required_players,
      8,
      null::uuid,
      0,
      '{}'::uuid[],
      '{}'::uuid[];
    return;
  end if;

  update public.quick_queue_ready_check_members m
  set accepted_at = coalesce(m.accepted_at, now())
  where m.ready_check_id = p_ready_check_id
    and m.user_id = v_user_id;

  select
    coalesce(array_agg(m.user_id order by m.created_at), '{}'::uuid[]),
    coalesce(array_agg(m.user_id order by m.created_at) filter (where m.accepted_at is not null), '{}'::uuid[]),
    count(*) filter (where m.accepted_at is not null)
  into v_participant_ids, v_accepted_ids, v_accepted_count
  from public.quick_queue_ready_check_members m
  where m.ready_check_id = p_ready_check_id;

  if v_accepted_count = v_required_players then
    v_owner_user_id := v_participant_ids[1 + floor(random() * v_required_players)::integer];

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
      v_ready_check.mode,
      'public',
      case when v_ready_check.team_size = 2 then 'Quick Queue Wingman' else 'Quick Queue Competitive' end,
      v_owner_user_id,
      'open',
      coalesce(v_ready_check.stake_amount, 0),
      v_ready_check.team_size,
      case when v_ready_check.team_size = 2 then 'wingman' else 'competitive' end,
      null,
      null,
      false,
      false
    )
    returning * into v_lobby;

    insert into public.lobby_members (lobby_id, user_id, team_side, is_ready)
    with ordered_members as (
      select
        m.user_id,
        row_number() over (order by m.created_at, m.user_id) as participant_position
      from public.quick_queue_ready_check_members m
      where m.ready_check_id = p_ready_check_id
    ),
    grouped_members as (
      select
        om.user_id,
        om.participant_position,
        coalesce(qpi.host_user_id, om.user_id) as group_root
      from ordered_members om
      left join public.quick_queue_party_invites qpi
        on qpi.invitee_user_id = om.user_id
       and qpi.host_user_id = any(v_participant_ids)
       and qpi.mode = v_ready_check.mode
       and qpi.team_size = v_ready_check.team_size
       and qpi.stake_amount = coalesce(v_ready_check.stake_amount, 0)
       and qpi.status = 'accepted'
    ),
    grouped_roots as (
      select
        gm.group_root,
        min(gm.participant_position) as first_position,
        count(*) as group_size
      from grouped_members gm
      group by gm.group_root
    ),
    grouped_roots_with_running_total as (
      select
        gr.group_root,
        gr.first_position,
        gr.group_size,
        sum(gr.group_size) over (order by gr.first_position, gr.group_root) as running_total
      from grouped_roots gr
    ),
    assigned_members as (
      select
        gm.user_id,
        case
          when gr.running_total <= v_ready_check.team_size then 'T'::public.ha_team_side
          else 'CT'::public.ha_team_side
        end as team_side
      from grouped_members gm
      join grouped_roots_with_running_total gr on gr.group_root = gm.group_root
    )
    select
      v_lobby.id,
      am.user_id,
      am.team_side,
      false
    from assigned_members am
    on conflict (lobby_id, user_id) do update
    set team_side = excluded.team_side,
        is_ready = false,
        joined_at = now(),
        left_at = null,
        kicked_at = null;

    update public.quick_queue_ready_checks rc
    set status = 'completed',
        lobby_id = v_lobby.id,
        owner_user_id = v_owner_user_id,
        completed_at = now()
    where rc.id = p_ready_check_id;

    update public.quick_queue_entries q
    set status = 'matched',
        matched_lobby_id = v_lobby.id,
        ready_check_id = p_ready_check_id,
        updated_at = now()
    where q.user_id = any(v_participant_ids);

    return query
    select
      'matched'::text,
      v_lobby.id,
      v_required_players,
      0,
      0,
      p_ready_check_id,
      v_accepted_count,
      v_participant_ids,
      v_accepted_ids;
    return;
  end if;

  return query
  select
    'ready_check'::text,
    null::uuid,
    v_accepted_count,
    greatest(v_required_players - v_accepted_count, 0),
    greatest(0, floor(extract(epoch from (v_ready_check.expires_at - now())))::integer),
    p_ready_check_id,
    v_accepted_count,
    v_participant_ids,
    v_accepted_ids;
end;
$$;

grant execute on function public.quick_queue_accept_match(uuid, boolean) to authenticated;
