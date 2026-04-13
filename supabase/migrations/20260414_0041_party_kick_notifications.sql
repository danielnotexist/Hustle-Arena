create or replace function public.respond_quick_queue_party_invite(
  p_invite_id bigint,
  p_action text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_invite public.quick_queue_party_invites%rowtype;
  v_actor_username text;
  v_result text;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_invite
  from public.quick_queue_party_invites q
  where q.id = p_invite_id
  for update;

  if not found then
    raise exception 'Party invite not found';
  end if;

  if p_action not in ('accept', 'decline', 'cancel') then
    raise exception 'Unsupported invite action';
  end if;

  if p_action = 'cancel' then
    if v_invite.host_user_id <> v_user_id then
      raise exception 'Only the party host can cancel this invite';
    end if;

    select coalesce(nullif(trim(username), ''), split_part(email, '@', 1), 'Player')
    into v_actor_username
    from public.profiles
    where id = v_user_id;

    update public.quick_queue_party_invites q
    set status = 'cancelled',
        responded_at = now(),
        updated_at = now()
    where q.id = p_invite_id;

    perform public.create_notification(
      v_invite.invitee_user_id,
      'party_invite_removed',
      'Party Invite Removed',
      coalesce(v_actor_username, 'Your party leader') || ' removed you from the party.',
      '/battlefield',
      jsonb_build_object(
        'invite_id', p_invite_id,
        'host_user_id', v_invite.host_user_id,
        'status', 'cancelled'
      )
    );

    return 'cancelled';
  end if;

  if v_invite.invitee_user_id <> v_user_id then
    raise exception 'Only the invited player can respond to this invite';
  end if;

  v_result := case when p_action = 'accept' then 'accepted' else 'declined' end;

  update public.quick_queue_party_invites q
  set status = v_result,
      responded_at = now(),
      updated_at = now()
  where q.id = p_invite_id;

  select coalesce(nullif(trim(username), ''), split_part(email, '@', 1), 'Player')
  into v_actor_username
  from public.profiles
  where id = v_user_id;

  perform public.create_notification(
    v_invite.host_user_id,
    'party_invite_response',
    'Party Invite Update',
    coalesce(v_actor_username, 'Your friend') ||
      case when v_result = 'accepted' then ' accepted your party invite.' else ' declined your party invite.' end,
    '/battlefield',
    jsonb_build_object(
      'invite_id', p_invite_id,
      'invitee_user_id', v_invite.invitee_user_id,
      'status', v_result
    )
  );

  return v_result;
end;
$$;

revoke all on function public.respond_quick_queue_party_invite(bigint, text) from public;
grant execute on function public.respond_quick_queue_party_invite(bigint, text) to authenticated;
