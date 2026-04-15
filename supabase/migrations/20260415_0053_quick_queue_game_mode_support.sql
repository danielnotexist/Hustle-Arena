-- 20260415_0053_quick_queue_game_mode_support.sql
-- Add explicit game-mode support to quick queue pools and status sync.

alter table public.quick_queue_entries
  add column if not exists game_mode text;

alter table public.quick_queue_ready_checks
  add column if not exists game_mode text;

update public.quick_queue_entries
set game_mode = case when team_size = 2 then 'wingman' else 'competitive' end
where game_mode is null;

update public.quick_queue_ready_checks
set game_mode = case when team_size = 2 then 'wingman' else 'competitive' end
where game_mode is null;

alter table public.quick_queue_entries
  drop constraint if exists quick_queue_entries_game_mode_check;

alter table public.quick_queue_entries
  add constraint quick_queue_entries_game_mode_check
  check (game_mode in ('wingman', 'competitive', 'team_ffa', 'ffa'));

alter table public.quick_queue_ready_checks
  drop constraint if exists quick_queue_ready_checks_game_mode_check;

alter table public.quick_queue_ready_checks
  add constraint quick_queue_ready_checks_game_mode_check
  check (game_mode in ('wingman', 'competitive', 'team_ffa', 'ffa'));

drop index if exists public.idx_quick_queue_entries_pool_by_mode_and_stake;

create index idx_quick_queue_entries_pool_by_mode_and_stake
  on public.quick_queue_entries(mode, team_size, queue_mode, game_mode, status, selected_stake_amount, created_at);

drop function if exists public.quick_queue_join_or_match(public.ha_mode, integer, text, numeric);

create or replace function public.quick_queue_join_or_match(
  p_mode public.ha_mode,
  p_team_size integer,
  p_queue_mode text,
  p_stake_amount numeric,
  p_game_mode text default null
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
  v_game_mode text := lower(coalesce(nullif(trim(p_game_mode), ''), case when p_team_size = 2 then 'wingman' else 'competitive' end));
  v_active_lobby public.lobbies%rowtype;
  v_existing_ready_check public.quick_queue_ready_checks%rowtype;
  v_players_joined integer := 0;
  v_queue_position integer := 1;
  v_selected_user_ids uuid[] := '{}'::uuid[];
  v_selected_count integer := 0;
  v_accepted_count integer := 0;
  v_participant_ids uuid[] := '{}'::uuid[];
  v_accepted_ids uuid[] := '{}'::uuid[];
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

  if p_team_size = 2 and v_game_mode <> 'wingman' then
    raise exception '2v2 quick queue only supports wingman mode';
  end if;

  if p_team_size = 5 and v_game_mode not in ('competitive', 'team_ffa', 'ffa') then
    raise exception '5v5 quick queue supports competitive, team_ffa, or ffa';
  end if;

  perform public.assert_user_can_access_mode(v_user_id, p_mode);

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
  where lm.user_id = v_user_id
    and lm.kicked_at is null
    and lm.left_at is null
    and l.mode = p_mode
    and l.team_size = p_team_size
    and l.game_mode = v_game_mode
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

    insert into public.quick_queue_entries (user_id, mode, team_size, queue_mode, game_mode, status, matched_lobby_id, ready_check_id, selected_stake_amount, updated_at)
    values (
      v_user_id,
      p_mode,
      p_team_size,
      v_queue_mode,
      v_game_mode,
      case when v_players_joined >= v_active_lobby.max_players then 'matched' else 'searching' end,
      case when v_players_joined >= v_active_lobby.max_players then v_active_lobby.id else null end,
      null,
      v_safe_stake,
      now()
    )
    on conflict (user_id) do update
    set mode = excluded.mode,
        team_size = excluded.team_size,
        queue_mode = excluded.queue_mode,
        game_mode = excluded.game_mode,
        status = excluded.status,
        matched_lobby_id = excluded.matched_lobby_id,
        ready_check_id = excluded.ready_check_id,
        selected_stake_amount = excluded.selected_stake_amount,
        updated_at = now();

    return query
    select
      case when v_players_joined >= v_active_lobby.max_players then 'matched' else 'searching' end,
      v_active_lobby.id,
      v_players_joined,
      greatest(v_active_lobby.max_players - v_players_joined, 0),
      greatest(10, greatest(v_active_lobby.max_players - v_players_joined, 0) * 12),
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
  where q.user_id = v_user_id
    and q.mode = p_mode
    and q.team_size = p_team_size
    and q.game_mode = v_game_mode
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
      v_accepted_count,
      greatest(v_required_players - v_accepted_count, 0),
      greatest(0, floor(extract(epoch from (v_existing_ready_check.expires_at - now())))::integer),
      v_existing_ready_check.id,
      v_accepted_count,
      v_participant_ids,
      v_accepted_ids;
    return;
  end if;

  insert into public.quick_queue_entries (user_id, mode, team_size, queue_mode, game_mode, status, matched_lobby_id, ready_check_id, selected_stake_amount, updated_at)
  values (
    v_user_id,
    p_mode,
    p_team_size,
    v_queue_mode,
    v_game_mode,
    'searching',
    null,
    null,
    v_safe_stake,
    now()
  )
  on conflict (user_id) do update
  set mode = excluded.mode,
      team_size = excluded.team_size,
      queue_mode = excluded.queue_mode,
      game_mode = excluded.game_mode,
      status = 'searching',
      matched_lobby_id = null,
      ready_check_id = null,
      selected_stake_amount = excluded.selected_stake_amount,
      updated_at = now();

  perform pg_advisory_xact_lock(hashtext(format('quick-queue:%s:%s:%s:%s:%s', p_mode::text, p_team_size, v_queue_mode, v_game_mode, v_safe_stake)));

  select rc.*
  into v_existing_ready_check
  from public.quick_queue_entries q
  join public.quick_queue_ready_checks rc on rc.id = q.ready_check_id
  where q.user_id = v_user_id
    and q.mode = p_mode
    and q.team_size = p_team_size
    and q.game_mode = v_game_mode
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
      v_accepted_count,
      greatest(v_required_players - v_accepted_count, 0),
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
      and q.game_mode = v_game_mode
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
    insert into public.quick_queue_ready_checks (mode, team_size, queue_mode, game_mode, stake_amount)
    values (p_mode, p_team_size, v_queue_mode, v_game_mode, v_safe_stake)
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
      0,
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
    and q.game_mode = v_game_mode
    and q.selected_stake_amount = v_safe_stake
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
    greatest(8, v_queue_position * 6),
    null::uuid,
    0,
    '{}'::uuid[],
    '{}'::uuid[];
end;
$$;

grant execute on function public.quick_queue_join_or_match(public.ha_mode, integer, text, numeric, text) to authenticated;

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
  v_effective_game_mode text;
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
  v_effective_game_mode := coalesce(v_ready_check.game_mode, case when v_ready_check.team_size = 2 then 'wingman' else 'competitive' end);

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
      case v_effective_game_mode
        when 'wingman' then 'Quick Queue Wingman'
        when 'team_ffa' then 'Quick Queue Team FFA'
        when 'ffa' then 'Quick Queue FFA'
        else 'Quick Queue Competitive'
      end,
      v_owner_user_id,
      'open',
      coalesce(v_ready_check.stake_amount, 0),
      v_ready_check.team_size,
      v_effective_game_mode,
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

drop function if exists public.get_my_quick_queue_status(public.ha_mode);

create or replace function public.get_my_quick_queue_status(
  p_mode public.ha_mode
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
  accepted_user_ids uuid[],
  team_size integer,
  queue_mode text,
  stake_amount numeric,
  game_mode text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_entry public.quick_queue_entries%rowtype;
  v_ready_check public.quick_queue_ready_checks%rowtype;
  v_participant_ids uuid[] := '{}'::uuid[];
  v_accepted_ids uuid[] := '{}'::uuid[];
  v_accepted_count integer := 0;
  v_party_host_user_id uuid := v_user_id;
  v_party_user_ids uuid[] := array[v_user_id];
  v_party_size integer := 1;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
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

  update public.quick_queue_entries q
  set status = 'cancelled',
      matched_lobby_id = null,
      ready_check_id = null,
      updated_at = now()
  where q.user_id = v_user_id
    and q.mode = p_mode
    and q.status = 'matched'
    and q.matched_lobby_id is not null
    and not exists (
      select 1
      from public.lobbies l
      join public.lobby_members lm on lm.lobby_id = l.id
      where l.id = q.matched_lobby_id
        and l.mode = p_mode
        and l.status in ('open', 'in_progress')
        and lm.user_id = v_user_id
        and lm.left_at is null
        and lm.kicked_at is null
    );

  select rc.*
  into v_ready_check
  from public.quick_queue_ready_check_members m
  join public.quick_queue_ready_checks rc on rc.id = m.ready_check_id
  where m.user_id = v_user_id
    and rc.mode = p_mode
    and rc.status = 'pending'
  order by rc.created_at desc
  limit 1;

  if found then
    select
      coalesce(array_agg(m.user_id order by m.created_at), '{}'::uuid[]),
      coalesce(array_agg(m.user_id order by m.created_at) filter (where m.accepted_at is not null), '{}'::uuid[]),
      count(*) filter (where m.accepted_at is not null)
    into v_participant_ids, v_accepted_ids, v_accepted_count
    from public.quick_queue_ready_check_members m
    where m.ready_check_id = v_ready_check.id;

    return query
    select
      'ready_check'::text,
      null::uuid,
      v_accepted_count,
      greatest(v_ready_check.team_size * 2 - v_accepted_count, 0),
      greatest(0, floor(extract(epoch from (v_ready_check.expires_at - now())))::integer),
      v_ready_check.id,
      v_accepted_count,
      v_participant_ids,
      v_accepted_ids,
      v_ready_check.team_size,
      v_ready_check.queue_mode,
      coalesce(v_ready_check.stake_amount, 0),
      coalesce(v_ready_check.game_mode, case when v_ready_check.team_size = 2 then 'wingman' else 'competitive' end);
    return;
  end if;

  select *
  into v_entry
  from public.quick_queue_entries q
  where q.user_id = v_user_id
    and q.mode = p_mode
    and (
      q.status = 'searching'
      or (
        q.status = 'matched'
        and q.matched_lobby_id is not null
        and exists (
          select 1
          from public.lobbies l
          join public.lobby_members lm on lm.lobby_id = l.id
          where l.id = q.matched_lobby_id
            and l.mode = p_mode
            and l.status in ('open', 'in_progress')
            and lm.user_id = v_user_id
            and lm.left_at is null
            and lm.kicked_at is null
        )
      )
    )
  order by q.updated_at desc
  limit 1;

  if not found then
    return;
  end if;

  if v_entry.queue_mode = 'party' then
    select q.host_user_id
    into v_party_host_user_id
    from public.quick_queue_party_invites q
    where q.invitee_user_id = v_user_id
      and q.mode = p_mode
      and q.team_size = v_entry.team_size
      and q.stake_amount = v_entry.selected_stake_amount
      and q.status = 'accepted'
    order by q.updated_at desc
    limit 1;

    if not found or v_party_host_user_id is null then
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
        and q.team_size = v_entry.team_size
        and q.stake_amount = v_entry.selected_stake_amount
        and q.status = 'accepted'
    ) participants;

    v_party_size := coalesce(array_length(v_party_user_ids, 1), 1);
  end if;

  return query
  select
    v_entry.status,
    v_entry.matched_lobby_id,
    greatest(v_party_size, 1),
    greatest(v_entry.team_size * 2 - greatest(v_party_size, 1), 0),
    8,
    null::uuid,
    0,
    '{}'::uuid[],
    '{}'::uuid[],
    v_entry.team_size,
    v_entry.queue_mode,
    coalesce(v_entry.selected_stake_amount, 0),
    coalesce(v_entry.game_mode, case when v_entry.team_size = 2 then 'wingman' else 'competitive' end);
end;
$$;

revoke all on function public.get_my_quick_queue_status(public.ha_mode) from public;
grant execute on function public.get_my_quick_queue_status(public.ha_mode) to authenticated;
