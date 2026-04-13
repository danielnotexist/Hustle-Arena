create or replace function public.send_friend_request(
  p_target_user_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requester_id uuid := auth.uid();
  v_requester_name text;
  v_existing_status public.ha_friend_request_status;
begin
  if v_requester_id is null then
    raise exception 'Authentication required';
  end if;

  if p_target_user_id is null then
    raise exception 'Target user is required';
  end if;

  if p_target_user_id = v_requester_id then
    raise exception 'You cannot send a friend request to yourself';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = p_target_user_id
  ) then
    raise exception 'Target user not found';
  end if;

  if exists (
    select 1
    from public.blocked_users
    where user_id = p_target_user_id
      and blocked_user_id = v_requester_id
  ) then
    raise exception 'This player is not accepting friend requests';
  end if;

  if exists (
    select 1
    from public.blocked_users
    where user_id = v_requester_id
      and blocked_user_id = p_target_user_id
  ) then
    raise exception 'Unblock this player before sending a friend request';
  end if;

  if exists (
    select 1
    from public.friends
    where (user_id = v_requester_id and friend_id = p_target_user_id)
       or (user_id = p_target_user_id and friend_id = v_requester_id)
  ) then
    return 'already_friends';
  end if;

  if exists (
    select 1
    from public.friend_requests
    where requester_id = p_target_user_id
      and target_id = v_requester_id
      and status = 'pending'
  ) then
    update public.friend_requests
    set status = 'accepted',
        updated_at = now()
    where requester_id = p_target_user_id
      and target_id = v_requester_id
      and status = 'pending';

    insert into public.friends (user_id, friend_id)
    values
      (v_requester_id, p_target_user_id),
      (p_target_user_id, v_requester_id)
    on conflict do nothing;

    perform public.create_notification(
      p_target_user_id,
      'friend_request',
      'Friend Request Accepted',
      'Your friend request was accepted.',
      '/social',
      jsonb_build_object('friend_id', v_requester_id, 'auto_accepted', true)
    );

    perform public.create_notification(
      v_requester_id,
      'friend_request',
      'Friend Added',
      'You are now friends.',
      '/social',
      jsonb_build_object('friend_id', p_target_user_id, 'auto_accepted', true)
    );

    return 'friends';
  end if;

  select status
  into v_existing_status
  from public.friend_requests
  where requester_id = v_requester_id
    and target_id = p_target_user_id;

  if v_existing_status = 'pending' then
    return 'already_requested';
  end if;

  if v_existing_status = 'accepted' then
    insert into public.friends (user_id, friend_id)
    values
      (v_requester_id, p_target_user_id),
      (p_target_user_id, v_requester_id)
    on conflict do nothing;
    return 'already_friends';
  end if;

  insert into public.friend_requests (requester_id, target_id, status, updated_at)
  values (v_requester_id, p_target_user_id, 'pending', now())
  on conflict (requester_id, target_id) do update
  set status = 'pending',
      updated_at = now();

  select coalesce(username, split_part(email, '@', 1), 'A player')
  into v_requester_name
  from public.profiles
  where id = v_requester_id;

  perform public.create_notification(
    p_target_user_id,
    'friend_request',
    'Friend Request',
    coalesce(v_requester_name, 'A player') || ' sent you a friend request',
    '/social',
    jsonb_build_object('requester_id', v_requester_id)
  );

  return 'requested';
end;
$$;

revoke all on function public.send_friend_request(uuid) from public;
grant execute on function public.send_friend_request(uuid) to authenticated;
