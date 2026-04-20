with ranked_invites as (
  select
    id,
    row_number() over (
      partition by host_user_id, invitee_user_id
      order by updated_at desc nulls last, responded_at desc nulls last, created_at desc nulls last, id desc
    ) as row_rank
  from public.quick_queue_party_invites
)
delete from public.quick_queue_party_invites q
using ranked_invites r
where q.id = r.id
  and r.row_rank > 1;

create unique index if not exists uq_quick_queue_party_invites_host_invitee
  on public.quick_queue_party_invites(host_user_id, invitee_user_id);

create or replace function public.send_quick_queue_party_invite(
  p_invitee_user_id uuid,
  p_mode public.ha_mode,
  p_team_size integer,
  p_stake_amount numeric
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_host_user_id uuid := auth.uid();
  v_existing public.quick_queue_party_invites%rowtype;
  v_host_username text;
begin
  if v_host_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_invitee_user_id is null or p_invitee_user_id = v_host_user_id then
    raise exception 'Choose a valid friend to invite';
  end if;

  if p_team_size not in (2, 5) then
    raise exception 'Party queue supports only 2v2 or 5v5';
  end if;

  if p_stake_amount < 5 or p_stake_amount > 1000 then
    raise exception 'Party queue stake must be between 5 and 1000 USDT';
  end if;

  if not exists (
    select 1
    from public.friends f
    where (f.user_id = v_host_user_id and f.friend_id = p_invitee_user_id)
       or (f.user_id = p_invitee_user_id and f.friend_id = v_host_user_id)
  ) then
    raise exception 'You can only invite friends to your party';
  end if;

  insert into public.quick_queue_party_invites (
    host_user_id,
    invitee_user_id,
    mode,
    team_size,
    stake_amount,
    status,
    responded_at,
    updated_at
  ) values (
    v_host_user_id,
    p_invitee_user_id,
    p_mode,
    p_team_size,
    p_stake_amount,
    'pending',
    null,
    now()
  )
  on conflict (host_user_id, invitee_user_id) do update
  set mode = excluded.mode,
      team_size = excluded.team_size,
      stake_amount = excluded.stake_amount,
      status = 'pending',
      responded_at = null,
      updated_at = now()
  returning *
  into v_existing;

  select coalesce(nullif(trim(username), ''), split_part(email, '@', 1), 'Player')
  into v_host_username
  from public.profiles
  where id = v_host_user_id;

  perform public.create_notification(
    p_invitee_user_id,
    'party_invite',
    'Party Invite',
    coalesce(v_host_username, 'A friend') || ' invited you to join a party queue.',
    '/battlefield',
    jsonb_build_object(
      'host_user_id', v_host_user_id,
      'team_size', p_team_size,
      'stake_amount', p_stake_amount,
      'mode', p_mode,
      'invite_id', v_existing.id
    )
  );

  return 'sent';
end;
$$;

revoke all on function public.send_quick_queue_party_invite(uuid, public.ha_mode, integer, numeric) from public;
grant execute on function public.send_quick_queue_party_invite(uuid, public.ha_mode, integer, numeric) to authenticated;
