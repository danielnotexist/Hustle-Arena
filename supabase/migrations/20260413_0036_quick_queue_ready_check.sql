create table if not exists public.quick_queue_ready_checks (
  id uuid primary key default gen_random_uuid(),
  mode public.ha_mode not null,
  team_size integer not null check (team_size in (2, 5)),
  queue_mode text not null default 'solo',
  status text not null default 'pending' check (status in ('pending', 'cancelled', 'expired', 'completed')),
  lobby_id uuid references public.lobbies(id) on delete set null,
  owner_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 seconds'),
  completed_at timestamptz
);

create table if not exists public.quick_queue_ready_check_members (
  ready_check_id uuid not null references public.quick_queue_ready_checks(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (ready_check_id, user_id)
);

create index if not exists idx_quick_queue_ready_checks_status
  on public.quick_queue_ready_checks(status, mode, team_size, queue_mode, created_at);

create index if not exists idx_quick_queue_ready_check_members_user
  on public.quick_queue_ready_check_members(user_id, ready_check_id);

alter table public.quick_queue_entries
  add column if not exists ready_check_id uuid references public.quick_queue_ready_checks(id) on delete set null;

create index if not exists idx_quick_queue_entries_ready_check
  on public.quick_queue_entries(ready_check_id);

alter table public.quick_queue_entries
  drop constraint if exists quick_queue_entries_status_check;

alter table public.quick_queue_entries
  add constraint quick_queue_entries_status_check
  check (status in ('searching', 'ready_check', 'matched', 'cancelled'));

drop function if exists public.quick_queue_join_or_match(public.ha_mode, integer, text);

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
declare
  v_user_id uuid := auth.uid();
  v_queue_mode text := coalesce(nullif(trim(lower(p_queue_mode)), ''), 'solo');
  v_required_players integer := p_team_size * 2;
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

    insert into public.quick_queue_entries (user_id, mode, team_size, queue_mode, status, matched_lobby_id, ready_check_id, updated_at)
    values (
      v_user_id,
      p_mode,
      p_team_size,
      v_queue_mode,
      case when v_players_joined >= v_active_lobby.max_players then 'matched' else 'searching' end,
      case when v_players_joined >= v_active_lobby.max_players then v_active_lobby.id else null end,
      null,
      now()
    )
    on conflict (user_id) do update
    set mode = excluded.mode,
        team_size = excluded.team_size,
        queue_mode = excluded.queue_mode,
        status = excluded.status,
        matched_lobby_id = excluded.matched_lobby_id,
        ready_check_id = excluded.ready_check_id,
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

  insert into public.quick_queue_entries (user_id, mode, team_size, queue_mode, status, matched_lobby_id, ready_check_id, updated_at)
  values (
    v_user_id,
    p_mode,
    p_team_size,
    v_queue_mode,
    'searching',
    null,
    null,
    now()
  )
  on conflict (user_id) do update
  set mode = excluded.mode,
      team_size = excluded.team_size,
      queue_mode = excluded.queue_mode,
      status = 'searching',
      matched_lobby_id = null,
      ready_check_id = null,
      updated_at = now();

  perform pg_advisory_xact_lock(hashtext(format('quick-queue:%s:%s:%s', p_mode::text, p_team_size, v_queue_mode)));

  select rc.*
  into v_existing_ready_check
  from public.quick_queue_entries q
  join public.quick_queue_ready_checks rc on rc.id = q.ready_check_id
  where q.user_id = v_user_id
    and q.mode = p_mode
    and q.team_size = p_team_size
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
      and q.status = 'searching'
    order by q.created_at asc
    for update skip locked
    limit v_required_players
  )
  select coalesce(array_agg(user_id order by created_at), '{}'::uuid[]), count(*)
  into v_selected_user_ids, v_selected_count
  from queued_players;

  if v_selected_count = v_required_players then
    insert into public.quick_queue_ready_checks (mode, team_size, queue_mode)
    values (p_mode, p_team_size, v_queue_mode)
    returning * into v_existing_ready_check;

    insert into public.quick_queue_ready_check_members (ready_check_id, user_id)
    select v_existing_ready_check.id, queued_user_id
    from unnest(v_selected_user_ids) as queued_user_id;

    update public.quick_queue_entries
    set status = 'ready_check',
        matched_lobby_id = null,
        ready_check_id = v_existing_ready_check.id,
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

grant execute on function public.quick_queue_join_or_match(public.ha_mode, integer, text) to authenticated;

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
      0,
      v_ready_check.team_size,
      case when v_ready_check.team_size = 2 then 'wingman' else 'competitive' end,
      null,
      null,
      false,
      false
    )
    returning * into v_lobby;

    insert into public.lobby_members (lobby_id, user_id, team_side, is_ready)
    select v_lobby.id, participant_user_id, 'UNASSIGNED', false
    from unnest(v_participant_ids) as participant_user_id
    on conflict (lobby_id, user_id) do update
    set team_side = 'UNASSIGNED',
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

create or replace function public.quick_queue_cancel(
  p_mode public.ha_mode
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_open_public_lobby uuid;
  v_ready_check_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select q.ready_check_id
  into v_ready_check_id
  from public.quick_queue_entries q
  where q.user_id = v_user_id
    and q.mode = p_mode
  limit 1;

  if v_ready_check_id is not null then
    update public.quick_queue_ready_checks rc
    set status = 'cancelled',
        completed_at = now()
    where rc.id = v_ready_check_id
      and rc.status = 'pending';

    update public.quick_queue_entries q
    set status = 'searching',
        matched_lobby_id = null,
        ready_check_id = null,
        updated_at = now()
    where q.ready_check_id = v_ready_check_id;
  end if;

  update public.quick_queue_entries q
  set status = 'cancelled',
      matched_lobby_id = null,
      ready_check_id = null,
      updated_at = now()
  where q.user_id = v_user_id
    and q.mode = p_mode;

  select l.id
  into v_open_public_lobby
  from public.lobby_members lm
  join public.lobbies l on l.id = lm.lobby_id
  where lm.user_id = v_user_id
    and lm.left_at is null
    and lm.kicked_at is null
    and l.mode = p_mode
    and l.kind = 'public'
    and l.status = 'open'
  limit 1;

  if v_open_public_lobby is not null then
    perform public.leave_matchmaking_lobby(v_open_public_lobby);
  end if;
end;
$$;

grant execute on function public.quick_queue_cancel(public.ha_mode) to authenticated;
