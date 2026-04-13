create or replace function public.respond_friend_request(
  p_request_id bigint,
  p_action text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_request public.friend_requests%rowtype;
  v_action text := lower(trim(coalesce(p_action, '')));
begin
  if v_actor_id is null then
    raise exception 'Authentication required';
  end if;

  if v_action not in ('accept', 'ignore', 'block') then
    raise exception 'Unsupported action';
  end if;

  select *
  into v_request
  from public.friend_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Friend request not found';
  end if;

  if v_request.target_id <> v_actor_id then
    raise exception 'Only the target user can respond to this request';
  end if;

  if v_request.status <> 'pending' then
    return 'already_resolved';
  end if;

  if v_action = 'accept' then
    update public.friend_requests
    set status = 'accepted',
        updated_at = now()
    where id = p_request_id;

    insert into public.friends (user_id, friend_id)
    values
      (v_request.target_id, v_request.requester_id),
      (v_request.requester_id, v_request.target_id)
    on conflict do nothing;

    perform public.create_notification(
      v_request.requester_id,
      'friend_request',
      'Friend Request Accepted',
      'Your friend request was accepted.',
      '/social',
      jsonb_build_object('friend_id', v_request.target_id)
    );

    return 'accepted';
  end if;

  if v_action = 'ignore' then
    update public.friend_requests
    set status = 'ignored',
        updated_at = now()
    where id = p_request_id;

    return 'ignored';
  end if;

  update public.friend_requests
  set status = 'blocked',
      updated_at = now()
  where id = p_request_id;

  insert into public.blocked_users (user_id, blocked_user_id)
  values (v_actor_id, v_request.requester_id)
  on conflict do nothing;

  return 'blocked';
end;
$$;

revoke all on function public.respond_friend_request(bigint, text) from public;
grant execute on function public.respond_friend_request(bigint, text) to authenticated;
