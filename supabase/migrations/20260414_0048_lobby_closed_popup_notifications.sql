-- 20260414_0048_lobby_closed_popup_notifications.sql
-- When the lobby leader closes an open lobby, notify every active member
-- so the frontend can show a dedicated popup.

create or replace function public.leave_matchmaking_lobby(
  p_lobby_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_lobby public.lobbies%rowtype;
  v_active_members integer;
  v_actor_username text;
  v_member record;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_lobby
  from public.lobbies
  where id = p_lobby_id
  for update;

  if not found then
    raise exception 'Lobby not found';
  end if;

  if not exists (
    select 1
    from public.lobby_members
    where lobby_id = p_lobby_id
      and user_id = v_user_id
      and kicked_at is null
      and left_at is null
  ) then
    raise exception 'You are not an active member of this lobby';
  end if;

  if v_lobby.status = 'open' and v_lobby.leader_id = v_user_id then
    select coalesce(nullif(trim(username), ''), split_part(email, '@', 1), 'Party Leader')
    into v_actor_username
    from public.profiles
    where id = v_user_id;

    for v_member in
      select lm.user_id
      from public.lobby_members lm
      where lm.lobby_id = p_lobby_id
        and lm.user_id <> v_user_id
        and lm.kicked_at is null
        and lm.left_at is null
    loop
      perform public.create_notification(
        v_member.user_id,
        'lobby_closed_by_leader',
        'Session Closed',
        'This Session Was Closed By The Party Leader',
        '/squad-hub',
        jsonb_build_object(
          'lobby_id', p_lobby_id,
          'leader_id', v_user_id,
          'leader_username', coalesce(v_actor_username, 'Party Leader')
        )
      );
    end loop;

    update public.lobbies
    set status = 'closed',
        close_reason = 'Lobby closed by leader',
        map_voting_active = false,
        auto_veto_starts_at = null,
        join_server_deadline = null,
        updated_at = now()
    where id = p_lobby_id;

    update public.lobby_members
    set left_at = now(),
        is_ready = false
    where lobby_id = p_lobby_id
      and kicked_at is null
      and left_at is null;

    perform public.reset_lobby_veto_state(p_lobby_id);
    return;
  end if;

  update public.lobby_members
  set left_at = now(),
      is_ready = false
  where lobby_id = p_lobby_id
    and user_id = v_user_id
    and kicked_at is null
    and left_at is null;

  select count(*)
  into v_active_members
  from public.lobby_members
  where lobby_id = p_lobby_id
    and kicked_at is null
    and left_at is null;

  if v_lobby.status = 'open' and v_active_members = 0 then
    update public.lobbies
    set status = 'closed',
        close_reason = 'Lobby emptied',
        map_voting_active = false,
        auto_veto_starts_at = null,
        join_server_deadline = null,
        updated_at = now()
    where id = p_lobby_id;

    perform public.reset_lobby_veto_state(p_lobby_id);
    return;
  end if;

  perform public.refresh_lobby_auto_veto(p_lobby_id);
end;
$$;
