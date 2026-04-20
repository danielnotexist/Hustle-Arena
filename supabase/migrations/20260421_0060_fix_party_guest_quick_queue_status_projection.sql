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
  v_party_team_size integer;
  v_party_stake_amount numeric(14,2);
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
    select
      q.host_user_id,
      q.team_size,
      q.stake_amount
    into
      v_party_host_user_id,
      v_party_team_size,
      v_party_stake_amount
    from public.quick_queue_party_invites q
    where q.invitee_user_id = v_user_id
      and q.mode = p_mode
      and q.status = 'accepted'
    order by q.updated_at desc
    limit 1;

    if found and v_party_host_user_id is not null and v_party_host_user_id <> v_user_id then
      select *
      into v_entry
      from public.quick_queue_entries q
      where q.user_id = v_party_host_user_id
        and q.mode = p_mode
        and q.team_size = v_party_team_size
        and q.selected_stake_amount = v_party_stake_amount
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
                and lm.user_id = v_party_host_user_id
                and lm.left_at is null
                and lm.kicked_at is null
            )
          )
        )
      order by q.updated_at desc
      limit 1;
    end if;
  end if;

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
