-- 20260421_0061_cancel_party_queue_for_all_members.sql
-- Cancelling quick queue from either the party leader or an invited teammate
-- should stop matchmaking for the entire active party context.

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
  v_ready_check_id uuid;
  v_open_public_lobby uuid;
  v_entry public.quick_queue_entries%rowtype;
  v_party_host_user_id uuid := v_user_id;
  v_party_user_ids uuid[] := array[v_user_id];
  v_context_team_size integer := null;
  v_context_stake numeric(14,2) := null;
  v_context_game_mode text := null;
  v_context_queue_mode text := null;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_entry
  from public.quick_queue_entries q
  where q.user_id = v_user_id
    and q.mode = p_mode
    and q.status in ('searching', 'ready_check', 'matched')
  order by q.updated_at desc
  limit 1;

  if found then
    v_context_team_size := v_entry.team_size;
    v_context_stake := v_entry.selected_stake_amount;
    v_context_game_mode := coalesce(v_entry.game_mode, case when v_entry.team_size = 2 then 'wingman' else 'competitive' end);
    v_context_queue_mode := v_entry.queue_mode;
  end if;

  select qpi.host_user_id
  into v_party_host_user_id
  from public.quick_queue_party_invites qpi
  where qpi.invitee_user_id = v_user_id
    and qpi.mode = p_mode
    and qpi.status = 'accepted'
    and (v_context_team_size is null or qpi.team_size = v_context_team_size)
    and (v_context_stake is null or qpi.stake_amount = v_context_stake)
  order by qpi.updated_at desc
  limit 1;

  if not found or v_party_host_user_id is null then
    v_party_host_user_id := v_user_id;
  end if;

  if v_context_team_size is null or v_context_stake is null or v_context_queue_mode is null then
    select *
    into v_entry
    from public.quick_queue_entries q
    where q.mode = p_mode
      and q.status in ('searching', 'ready_check', 'matched')
      and (
        q.user_id = v_party_host_user_id
        or q.user_id in (
          select qpi.invitee_user_id
          from public.quick_queue_party_invites qpi
          where qpi.host_user_id = v_party_host_user_id
            and qpi.mode = p_mode
            and qpi.status = 'accepted'
        )
      )
    order by q.updated_at desc
    limit 1;

    if found then
      v_context_team_size := v_entry.team_size;
      v_context_stake := v_entry.selected_stake_amount;
      v_context_game_mode := coalesce(v_entry.game_mode, case when v_entry.team_size = 2 then 'wingman' else 'competitive' end);
      v_context_queue_mode := v_entry.queue_mode;
    end if;
  end if;

  if v_context_queue_mode = 'party' or v_party_host_user_id <> v_user_id then
    select coalesce(array_agg(participant_id order by participant_id), array[v_party_host_user_id])
    into v_party_user_ids
    from (
      select v_party_host_user_id as participant_id
      union
      select qpi.invitee_user_id
      from public.quick_queue_party_invites qpi
      where qpi.host_user_id = v_party_host_user_id
        and qpi.mode = p_mode
        and qpi.status = 'accepted'
        and (v_context_team_size is null or qpi.team_size = v_context_team_size)
        and (v_context_stake is null or qpi.stake_amount = v_context_stake)
    ) participants;
  end if;

  select q.ready_check_id
  into v_ready_check_id
  from public.quick_queue_entries q
  where q.user_id = any(v_party_user_ids)
    and q.mode = p_mode
    and q.ready_check_id is not null
  order by q.updated_at desc
  limit 1;

  if v_ready_check_id is not null then
    update public.quick_queue_ready_checks rc
    set status = 'cancelled',
        completed_at = now()
    where rc.id = v_ready_check_id
      and rc.status = 'pending';

    update public.quick_queue_entries q
    set status = 'cancelled',
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
  where q.user_id = any(v_party_user_ids)
    and q.mode = p_mode
    and (v_context_team_size is null or q.team_size = v_context_team_size)
    and (v_context_stake is null or q.selected_stake_amount = v_context_stake)
    and (v_context_queue_mode is null or q.queue_mode = v_context_queue_mode)
    and (v_context_game_mode is null or coalesce(q.game_mode, case when q.team_size = 2 then 'wingman' else 'competitive' end) = v_context_game_mode);

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
