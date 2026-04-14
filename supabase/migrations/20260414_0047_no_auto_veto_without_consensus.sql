-- 20260414_0047_no_auto_veto_without_consensus.sql
-- Enforce timeout behavior for map voting:
-- If the active team does not reach valid consensus before the turn ends,
-- do not remove any map. Rotate turn to the other team instead.

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
  v_top_vote_count integer := 0;
  v_top_vote_tie_count integer := 0;
  v_next_team public.ha_team_side;
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
  v_next_team := case when v_session.active_team = 'T' then 'CT'::public.ha_team_side else 'T'::public.ha_team_side end;

  if p_veto_map is null then
    with vote_counts as (
      select
        mv.map_code,
        count(*)::integer as vote_count,
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
    ),
    ranked as (
      select
        vc.map_code,
        vc.vote_count,
        vc.first_vote_at
      from vote_counts vc
      order by vc.vote_count desc, vc.first_vote_at asc, vc.map_code asc
    )
    select
      r.map_code,
      r.vote_count,
      (
        select count(*)
        from vote_counts vc2
        where vc2.vote_count = r.vote_count
      )::integer
    into v_veto_map, v_top_vote_count, v_top_vote_tie_count
    from ranked r
    limit 1;

    -- Timeout without consensus should NEVER auto-remove a map.
    if v_veto_map is null
       or coalesce(v_top_vote_count, 0) < v_required_votes
       or coalesce(v_top_vote_tie_count, 0) > 1 then
      delete from public.map_votes
      where session_id = v_session.id;

      update public.map_vote_sessions
      set active_team = v_next_team,
          round_number = coalesce(v_session.round_number, 1) + 1,
          last_vetoed_map = null,
          turn_ends_at = now() + make_interval(secs => coalesce(v_session.turn_seconds, 15)),
          updated_at = now()
      where id = v_session.id;

      return;
    end if;
  else
    v_veto_map := p_veto_map;
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
        active_team = v_next_team,
        round_number = coalesce(v_session.round_number, 1) + 1,
        last_vetoed_map = v_veto_map,
        turn_ends_at = now() + make_interval(secs => coalesce(v_session.turn_seconds, 15)),
        updated_at = now()
    where id = v_session.id;
  end if;
end;
$$;
