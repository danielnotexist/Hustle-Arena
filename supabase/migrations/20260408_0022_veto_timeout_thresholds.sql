create or replace function public.advance_map_vote_round(
  p_session_id uuid,
  p_veto_map text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.map_vote_sessions%rowtype;
  v_lobby public.lobbies%rowtype;
  v_veto_map text;
  v_remaining_maps text[];
  v_required_votes integer;
  v_vote_count integer := 0;
begin
  select *
  into v_session
  from public.map_vote_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'Map vote session not found';
  end if;

  if v_session.status <> 'active' then
    return;
  end if;

  select *
  into v_lobby
  from public.lobbies
  where id = v_session.lobby_id
  for update;

  if not found then
    raise exception 'Lobby not found';
  end if;

  if p_veto_map is not null and not (p_veto_map = any(v_session.remaining_maps)) then
    raise exception 'Selected map is not available for veto';
  end if;

  v_required_votes := case when coalesce(v_lobby.team_size, 5) >= 5 then 2 else 1 end;

  if p_veto_map is null then
    select ranked.map_code, ranked.vote_count
    into v_veto_map, v_vote_count
    from (
      select
        mv.map_code,
        count(*) as vote_count,
        min(mv.updated_at) as first_vote_at
      from public.map_votes mv
      join public.lobby_members lm
        on lm.lobby_id = v_session.lobby_id
       and lm.user_id = mv.user_id
       and lm.kicked_at is null
       and lm.left_at is null
       and lm.team_side = v_session.active_team
      where mv.session_id = v_session.id
        and mv.map_code = any(v_session.remaining_maps)
      group by mv.map_code
    ) as ranked
    order by ranked.vote_count desc, ranked.first_vote_at asc, ranked.map_code asc
    limit 1;

    if coalesce(v_vote_count, 0) < v_required_votes then
      delete from public.map_votes
      where session_id = v_session.id;

      update public.map_vote_sessions
      set turn_ends_at = now() + make_interval(secs => coalesce(v_session.turn_seconds, 15)),
          updated_at = now()
      where id = v_session.id;

      return;
    end if;
  else
    v_veto_map := p_veto_map;
  end if;

  if v_veto_map is null then
    delete from public.map_votes
    where session_id = v_session.id;

    update public.map_vote_sessions
    set turn_ends_at = now() + make_interval(secs => coalesce(v_session.turn_seconds, 15)),
        updated_at = now()
    where id = v_session.id;

    return;
  end if;

  v_remaining_maps := array_remove(v_session.remaining_maps, v_veto_map);

  delete from public.map_votes
  where session_id = v_session.id;

  if coalesce(array_length(v_remaining_maps, 1), 0) <= 1 then
    update public.map_vote_sessions
    set remaining_maps = v_remaining_maps,
        status = 'completed',
        last_vetoed_map = v_veto_map,
        turn_ends_at = null,
        updated_at = now()
    where id = v_session.id;

    update public.lobbies
    set selected_map = coalesce(v_remaining_maps[1], v_veto_map),
        map_voting_active = false,
        updated_at = now()
    where id = v_session.lobby_id;

    perform public.ensure_pending_lobby_match(v_session.lobby_id);
  else
    update public.map_vote_sessions
    set remaining_maps = v_remaining_maps,
        active_team = case when v_session.active_team = 'T' then 'CT'::public.ha_team_side else 'T'::public.ha_team_side end,
        round_number = coalesce(v_session.round_number, 1) + 1,
        last_vetoed_map = v_veto_map,
        turn_ends_at = now() + make_interval(secs => coalesce(v_session.turn_seconds, 15)),
        updated_at = now()
    where id = v_session.id;
  end if;
end;
$$;

create or replace function public.cast_lobby_map_vote(
  p_session_id uuid,
  p_map_code text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_session public.map_vote_sessions%rowtype;
  v_team_side public.ha_team_side;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  perform public.sync_map_vote_session(p_session_id);

  select *
  into v_session
  from public.map_vote_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'Map vote session not found';
  end if;

  if v_session.status <> 'active' then
    raise exception 'This map vote session is not active';
  end if;

  if not (p_map_code = any(v_session.remaining_maps)) then
    raise exception 'This map is no longer available';
  end if;

  select lm.team_side
  into v_team_side
  from public.lobby_members lm
  where lm.lobby_id = v_session.lobby_id
    and lm.user_id = v_user_id
    and lm.kicked_at is null
    and lm.left_at is null;

  if not found then
    raise exception 'You are not an active member of this lobby';
  end if;

  if v_team_side <> v_session.active_team then
    raise exception 'It is not your team''s turn to veto';
  end if;

  insert into public.map_votes (session_id, user_id, map_code, updated_at)
  values (p_session_id, v_user_id, p_map_code, now())
  on conflict (session_id, user_id) do update
  set map_code = excluded.map_code,
      updated_at = excluded.updated_at;
end;
$$;
