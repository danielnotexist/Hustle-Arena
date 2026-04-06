-- 20260406_0016_close_open_lobby_for_all_on_leader_exit.sql

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
    update public.lobbies
    set status = 'closed',
        close_reason = 'Lobby closed by leader',
        map_voting_active = false,
        join_server_deadline = null,
        updated_at = now()
    where id = p_lobby_id;

    update public.lobby_members
    set left_at = now(),
        is_ready = false
    where lobby_id = p_lobby_id
      and kicked_at is null
      and left_at is null;

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
        join_server_deadline = null,
        updated_at = now()
    where id = p_lobby_id;
  end if;
end;
$$;
