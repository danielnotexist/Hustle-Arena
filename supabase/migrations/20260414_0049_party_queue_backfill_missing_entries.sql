-- 20260414_0049_party_queue_backfill_missing_entries.sql
-- Fix: party host queue starts could proceed with partial quick_queue_entries if a prior
-- searching row already existed for only a subset of party members.
-- Resulting bug: one invited teammate might never get searching/ready-check state.

create or replace function public.quick_queue_join_or_match(
  p_mode public.ha_mode,
  p_team_size integer,
  p_queue_mode text,
  p_stake_amount numeric
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
  v_queue_mode text := coalesce(nullif(trim(lower(p_queue_mode)), ''), 'solo');
  v_required_players integer := p_team_size * 2;
  v_safe_stake numeric(14,2) := greatest(coalesce(p_stake_amount, 0), 0);
  v_active_lobby public.lobbies%rowtype;
  v_existing_ready_check public.quick_queue_ready_checks%rowtype;
  v_players_joined integer := 0;
  v_queue_position integer := 1;
  v_selected_user_ids uuid[] := '{}'::uuid[];
  v_selected_count integer := 0;
  v_accepted_count integer := 0;
  v_participant_ids uuid[] := '{}'::uuid[];
  v_accepted_ids uuid[] := '{}'::uuid[];
  v_party_host_user_id uuid := v_user_id;
  v_party_user_ids uuid[] := array[v_user_id];
  v_party_size integer := 1;
  v_is_party_guest boolean := false;
  v_existing_search_count integer := 0;
  v_anchor_created_at timestamptz;
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

  if v_safe_stake < 5 or v_safe_stake > 1000 then
    raise exception 'Quick queue stake must be between 5 and 1000 USDT';
  end if;

  perform public.assert_user_can_access_mode(v_user_id, p_mode);

  if v_queue_mode = 'party' then
    select q.host_user_id
    into v_party_host_user_id
    from public.quick_queue_party_invites q
    where q.invitee_user_id = v_user_id
      and q.mode = p_mode
      and q.team_size = p_team_size
      and q.stake_amount = v_safe_stake
      and q.status = 'accepted'
    order by q.updated_at desc
    limit 1;

    if found and v_party_host_user_id is not null and v_party_host_user_id <> v_user_id then
      v_is_party_guest := true;
    else
      v_party_host_user_id := v_user_id;
    end if;

    select coalesce(array_agg(participant_id order by participant_id), array[v_party_host_user_id])
    into v_party_user_ids
    from (
      select v_party_host_user_id as participant_id
      union
      select q.invitee_user_id
      from public.quick_queue_party_invites q
      where q.host_user_id = v_party_host_user_id
        and q.mode = p_mode
        and q.team_size = p_team_size
        and q.stake_amount = v_safe_stake
        and q.status = 'accepted'
    ) participants;

    v_party_size := coalesce(array_length(v_party_user_ids, 1), 1);
  end if;

  update public.quick_queue_ready_checks rc
  set status = 'expired'
  where rc.status = 'pending'
    and rc.expires_at <= now();

  update public.quick_queue_entries q
  set status = 'searching',
      matched_lobby_id = null,
      ready_check_id = null,
      updated_at = now()
  where q.ready_check_id in (
      select rc.id
      from public.quick_queue_ready_checks rc
      where rc.status = 'expired'
    )
    and q.status = 'ready_check';

  select l.*
  into v_active_lobby
  from public.lobby_members lm
  join public.lobbies l on l.id = lm.lobby_id
  where lm.user_id = any(v_party_user_ids)
    and lm.kicked_at is null
    and lm.left_at is null
    and l.mode = p_mode
    and l.team_size = p_team_size
    and l.stake_amount = v_safe_stake
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

    insert into public.quick_queue_entries (user_id, mode, team_size, queue_mode, status, matched_lobby_id, ready_check_id, selected_stake_amount, updated_at)
    select
      participant_user_id,
      p_mode,
      p_team_size,
      v_queue_mode,
      case when v_players_joined >= v_active_lobby.max_players then 'matched' else 'searching' end,
      case when v_players_joined >= v_active_lobby.max_players then v_active_lobby.id else null end,
      null,
      v_safe_stake,
      now()
    from unnest(v_party_user_ids) as participant_user_id
    on conflict (user_id) do update
    set mode = excluded.mode,
        team_size = excluded.team_size,
        queue_mode = excluded.queue_mode,
        status = excluded.status,
        matched_lobby_id = excluded.matched_lobby_id,
        ready_check_id = excluded.ready_check_id,
        selected_stake_amount = excluded.selected_stake_amount,
        updated_at = now();

    return query
    select
      case when v_players_joined >= v_active_lobby.max_players then 'matched' else 'searching' end,
      v_active_lobby.id,
      greatest(v_players_joined, v_party_size),
      greatest(v_active_lobby.max_players - greatest(v_players_joined, v_party_size), 0),
      greatest(10, greatest(v_active_lobby.max_players - greatest(v_players_joined, v_party_size), 0) * 12),
      null::uuid,
      0,
      '{}'::uuid[],
      '{}'::uuid[];
    return;
  end if;

  select rc.*
  into v_existing_ready_check
  from public.quick_queue_entries q
  join public.quick_queue_ready_checks rc on rc.id = q.ready_check_id
  where q.user_id = any(v_party_user_ids)
    and q.mode = p_mode
    and q.team_size = p_team_size
    and q.selected_stake_amount = v_safe_stake
    and q.status = 'ready_check'
    and rc.status = 'pending'
  limit 1;

  if found then
    select
      coalesce(array_agg(m.user_id order by m.created_at), '{}'::uuid[]),
      coalesce(array_agg(m.user_id order by m.created_at) filter (where m.accepted_at is not null), '{}'::uuid[]),
      count(*) filter (where m.accepted_at is not null)
    into v_participant_ids, v_accepted_ids, v_accepted_count
    from public.quick_queue_ready_check_members m
    where m.ready_check_id = v_existing_ready_check.id;

    return query
    select
      'ready_check'::text,
      null::uuid,
      greatest(v_accepted_count, v_party_size),
      greatest(v_required_players - greatest(v_accepted_count, v_party_size), 0),
      greatest(0, floor(extract(epoch from (v_existing_ready_check.expires_at - now())))::integer),
      v_existing_ready_check.id,
      v_accepted_count,
      v_participant_ids,
      v_accepted_ids;
    return;
  end if;

  -- Critical fix:
  -- For party hosts, always upsert queue rows for the full accepted party before matching.
  -- This prevents partial party queue state when some members had no searching row yet.
  if v_queue_mode = 'party' and not v_is_party_guest then
    insert into public.quick_queue_entries (user_id, mode, team_size, queue_mode, status, matched_lobby_id, ready_check_id, selected_stake_amount, updated_at)
    select
      participant_user_id,
      p_mode,
      p_team_size,
      v_queue_mode,
      'searching',
      null,
      null,
      v_safe_stake,
      now()
    from unnest(v_party_user_ids) as participant_user_id
    on conflict (user_id) do update
    set mode = excluded.mode,
        team_size = excluded.team_size,
        queue_mode = excluded.queue_mode,
        status = case
          when public.quick_queue_entries.status = 'ready_check' and public.quick_queue_entries.ready_check_id is not null
            then public.quick_queue_entries.status
          else 'searching'
        end,
        matched_lobby_id = case
          when public.quick_queue_entries.status = 'ready_check' and public.quick_queue_entries.ready_check_id is not null
            then public.quick_queue_entries.matched_lobby_id
          else null
        end,
        ready_check_id = case
          when public.quick_queue_entries.status = 'ready_check' and public.quick_queue_entries.ready_check_id is not null
            then public.quick_queue_entries.ready_check_id
          else null
        end,
        selected_stake_amount = excluded.selected_stake_amount,
        updated_at = now();
  end if;

  select
    count(*),
    min(q.created_at)
  into v_existing_search_count, v_anchor_created_at
  from public.quick_queue_entries q
  where q.user_id = any(v_party_user_ids)
    and q.mode = p_mode
    and q.team_size = p_team_size
    and q.queue_mode = v_queue_mode
    and q.selected_stake_amount = v_safe_stake
    and q.status = 'searching';

  if v_existing_search_count > 0 and v_is_party_guest then
    select count(*) + 1
    into v_queue_position
    from public.quick_queue_entries q
    where q.mode = p_mode
      and q.team_size = p_team_size
      and q.queue_mode = v_queue_mode
      and q.selected_stake_amount = v_safe_stake
      and q.status = 'searching'
      and q.created_at < coalesce(v_anchor_created_at, now());

    return query
    select
      'searching'::text,
      null::uuid,
      greatest(v_existing_search_count, v_party_size),
      greatest(v_required_players - greatest(v_existing_search_count, v_party_size), 0),
      greatest(8, v_queue_position * 6),
      null::uuid,
      0,
      '{}'::uuid[],
      '{}'::uuid[];
    return;
  end if;

  if v_existing_search_count = 0 then
    if v_is_party_guest then
      return query
      select
        'searching'::text,
        null::uuid,
        v_party_size,
        greatest(v_required_players - v_party_size, 0),
        8,
        null::uuid,
        0,
        '{}'::uuid[],
        '{}'::uuid[];
      return;
    end if;

    insert into public.quick_queue_entries (user_id, mode, team_size, queue_mode, status, matched_lobby_id, ready_check_id, selected_stake_amount, updated_at)
    select
      participant_user_id,
      p_mode,
      p_team_size,
      v_queue_mode,
      'searching',
      null,
      null,
      v_safe_stake,
      now()
    from unnest(v_party_user_ids) as participant_user_id
    on conflict (user_id) do update
    set mode = excluded.mode,
        team_size = excluded.team_size,
        queue_mode = excluded.queue_mode,
        status = 'searching',
        matched_lobby_id = null,
        ready_check_id = null,
        selected_stake_amount = excluded.selected_stake_amount,
        updated_at = now();
  end if;

  perform pg_advisory_xact_lock(hashtext(format('quick-queue:%s:%s:%s:%s', p_mode::text, p_team_size, v_queue_mode, v_safe_stake)));

  select rc.*
  into v_existing_ready_check
  from public.quick_queue_entries q
  join public.quick_queue_ready_checks rc on rc.id = q.ready_check_id
  where q.user_id = any(v_party_user_ids)
    and q.mode = p_mode
    and q.team_size = p_team_size
    and q.selected_stake_amount = v_safe_stake
    and q.status = 'ready_check'
    and rc.status = 'pending'
  limit 1;

  if found then
    select
      coalesce(array_agg(m.user_id order by m.created_at), '{}'::uuid[]),
      coalesce(array_agg(m.user_id order by m.created_at) filter (where m.accepted_at is not null), '{}'::uuid[]),
      count(*) filter (where m.accepted_at is not null)
    into v_participant_ids, v_accepted_ids, v_accepted_count
    from public.quick_queue_ready_check_members m
    where m.ready_check_id = v_existing_ready_check.id;

    return query
    select
      'ready_check'::text,
      null::uuid,
      greatest(v_accepted_count, v_party_size),
      greatest(v_required_players - greatest(v_accepted_count, v_party_size), 0),
      greatest(0, floor(extract(epoch from (v_existing_ready_check.expires_at - now())))::integer),
      v_existing_ready_check.id,
      v_accepted_count,
      v_participant_ids,
      v_accepted_ids;
    return;
  end if;

  with queued_players as (
    select q.user_id, q.created_at
    from public.quick_queue_entries q
    where q.mode = p_mode
      and q.team_size = p_team_size
      and q.queue_mode = v_queue_mode
      and q.selected_stake_amount = v_safe_stake
      and q.status = 'searching'
    order by q.created_at asc
    for update skip locked
    limit v_required_players
  )
  select coalesce(array_agg(user_id order by created_at), '{}'::uuid[]), count(*)
  into v_selected_user_ids, v_selected_count
  from queued_players;

  if v_selected_count = v_required_players then
    insert into public.quick_queue_ready_checks (mode, team_size, queue_mode, stake_amount)
    values (p_mode, p_team_size, v_queue_mode, v_safe_stake)
    returning * into v_existing_ready_check;

    insert into public.quick_queue_ready_check_members (ready_check_id, user_id)
    select v_existing_ready_check.id, queued_user_id
    from unnest(v_selected_user_ids) as queued_user_id;

    update public.quick_queue_entries
    set status = 'ready_check',
        matched_lobby_id = null,
        ready_check_id = v_existing_ready_check.id,
        selected_stake_amount = v_safe_stake,
        updated_at = now()
    where user_id = any(v_selected_user_ids);

    return query
    select
      'ready_check'::text,
      null::uuid,
      greatest(v_party_size, 0),
      v_required_players,
      greatest(0, floor(extract(epoch from (v_existing_ready_check.expires_at - now())))::integer),
      v_existing_ready_check.id,
      0,
      v_selected_user_ids,
      '{}'::uuid[];
    return;
  end if;

  select count(*) + 1
  into v_queue_position
  from public.quick_queue_entries q
  where q.mode = p_mode
    and q.team_size = p_team_size
    and q.queue_mode = v_queue_mode
    and q.selected_stake_amount = v_safe_stake
    and q.status = 'searching'
    and q.created_at < (
      select min(created_at)
      from public.quick_queue_entries
      where user_id = any(v_party_user_ids)
    );

  return query
  select
    'searching'::text,
    null::uuid,
    greatest(v_selected_count, v_party_size),
    greatest(v_required_players - greatest(v_selected_count, v_party_size), 0),
    greatest(8, v_queue_position * 6),
    null::uuid,
    0,
    '{}'::uuid[],
    '{}'::uuid[];
end;
$$;

grant execute on function public.quick_queue_join_or_match(public.ha_mode, integer, text, numeric) to authenticated;
