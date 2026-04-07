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

  if p_veto_map is null then
    select ranked.map_code
    into v_veto_map
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
  else
    v_veto_map := p_veto_map;
  end if;

  if v_veto_map is null then
    v_veto_map := v_session.remaining_maps[1];
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
