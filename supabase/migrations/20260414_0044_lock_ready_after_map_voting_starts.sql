create or replace function public.set_lobby_member_ready(
  p_lobby_id uuid,
  p_is_ready boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_lobby public.lobbies%rowtype;
  v_map_vote_active boolean := false;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_lobby
  from public.lobbies
  where id = p_lobby_id;

  if not found then
    raise exception 'Lobby not found';
  end if;

  perform public.assert_user_can_access_mode(v_user_id, v_lobby.mode);

  select exists (
    select 1
    from public.map_vote_sessions mvs
    where mvs.lobby_id = p_lobby_id
      and mvs.status = 'active'
  )
  into v_map_vote_active;

  if not p_is_ready and (
    v_map_vote_active
    or coalesce(v_lobby.map_voting_active, false)
    or coalesce(v_lobby.selected_map, '') <> ''
  ) then
    raise exception 'Ready cannot be changed after map voting has started';
  end if;

  if p_is_ready then
    perform public.assert_user_has_required_lobby_balance(v_user_id, v_lobby.mode, v_lobby.stake_amount);
  end if;

  update public.lobby_members
  set is_ready = p_is_ready
  where lobby_id = p_lobby_id
    and user_id = v_user_id
    and kicked_at is null
    and left_at is null;

  if not found then
    raise exception 'You are not an active member of this lobby';
  end if;

  perform public.refresh_lobby_auto_veto(p_lobby_id);
end;
$$;
