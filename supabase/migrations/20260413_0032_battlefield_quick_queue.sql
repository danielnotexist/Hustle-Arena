create table if not exists public.quick_queue_entries (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  mode public.ha_mode not null,
  team_size integer not null check (team_size in (2, 5)),
  queue_mode text not null default 'solo',
  status text not null default 'searching' check (status in ('searching', 'matched', 'cancelled')),
  matched_lobby_id uuid references public.lobbies(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create index if not exists idx_quick_queue_entries_pool
  on public.quick_queue_entries(mode, team_size, status, created_at);

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
  v_active_lobby public.lobbies%rowtype;
  v_target_lobby public.lobbies%rowtype;
  v_players_joined integer := 0;
  v_queue_position integer := 1;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_team_size not in (2, 5) then
    raise exception 'Quick queue supports only 2v2 or 5v5';
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
      coalesce(nullif(trim(p_queue_mode), ''), 'solo'),
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
      greatest(10, (greatest(v_active_lobby.max_players - v_players_joined, 0) * 12));
    return;
  end if;

  insert into public.quick_queue_entries (user_id, mode, team_size, queue_mode, status, matched_lobby_id, updated_at)
  values (
    v_user_id,
    p_mode,
    p_team_size,
    coalesce(nullif(trim(p_queue_mode), ''), 'solo'),
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

  select l.*
  into v_target_lobby
  from public.lobbies l
  where l.mode = p_mode
    and l.kind = 'public'
    and l.status = 'open'
    and l.team_size = p_team_size
    and exists (
      select 1
      from public.lobby_members lm
      where lm.lobby_id = l.id
        and lm.kicked_at is null
        and lm.left_at is null
    )
    and (
      select count(*)
      from public.lobby_members lm
      where lm.lobby_id = l.id
        and lm.kicked_at is null
        and lm.left_at is null
    ) < l.max_players
  order by l.created_at asc
  for update skip locked
  limit 1;

  if not found then
    select *
    into v_target_lobby
    from public.lobbies
    where id = public.create_matchmaking_lobby(
      p_mode,
      'public',
      case when p_team_size = 2 then 'Quick Queue 2v2' else 'Quick Queue 5v5' end,
      p_team_size,
      case when p_team_size = 2 then 'wingman' else 'competitive' end,
      0,
      null
    );
  else
    perform public.join_matchmaking_lobby(v_target_lobby.id);
  end if;

  select count(*)
  into v_players_joined
  from public.lobby_members lm
  where lm.lobby_id = v_target_lobby.id
    and lm.kicked_at is null
    and lm.left_at is null;

  if v_players_joined >= v_target_lobby.max_players then
    update public.quick_queue_entries q
    set status = 'matched',
        matched_lobby_id = v_target_lobby.id,
        updated_at = now()
    where q.user_id in (
      select lm.user_id
      from public.lobby_members lm
      where lm.lobby_id = v_target_lobby.id
        and lm.kicked_at is null
        and lm.left_at is null
    );

    return query
    select
      'matched'::text,
      v_target_lobby.id,
      v_players_joined,
      0,
      0;
    return;
  end if;

  select count(*) + 1
  into v_queue_position
  from public.quick_queue_entries q
  where q.mode = p_mode
    and q.team_size = p_team_size
    and q.status = 'searching'
    and q.created_at < (
      select created_at
      from public.quick_queue_entries
      where user_id = v_user_id
    );

  return query
  select
    'searching'::text,
    v_target_lobby.id,
    v_players_joined,
    greatest(v_target_lobby.max_players - v_players_joined, 0),
    greatest(8, v_queue_position * 6);
end;
$$;

grant execute on function public.quick_queue_join_or_match(public.ha_mode, integer, text) to authenticated;

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
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  update public.quick_queue_entries
  set status = 'cancelled',
      matched_lobby_id = null,
      updated_at = now()
  where user_id = v_user_id
    and mode = p_mode;

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
