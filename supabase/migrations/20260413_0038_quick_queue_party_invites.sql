create table if not exists public.quick_queue_party_invites (
  id bigserial primary key,
  host_user_id uuid not null references public.profiles(id) on delete cascade,
  invitee_user_id uuid not null references public.profiles(id) on delete cascade,
  mode public.ha_mode not null,
  team_size integer not null check (team_size in (2, 5)),
  stake_amount numeric(14,2) not null check (stake_amount >= 5 and stake_amount <= 1000),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled', 'expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (host_user_id, invitee_user_id)
);

create index if not exists idx_quick_queue_party_invites_host
  on public.quick_queue_party_invites(host_user_id, updated_at desc);

create index if not exists idx_quick_queue_party_invites_invitee
  on public.quick_queue_party_invites(invitee_user_id, updated_at desc);

alter table public.quick_queue_party_invites enable row level security;

drop policy if exists quick_queue_party_invites_select_participants on public.quick_queue_party_invites;
create policy quick_queue_party_invites_select_participants on public.quick_queue_party_invites
for select to authenticated
using (auth.uid() = host_user_id or auth.uid() = invitee_user_id);

drop policy if exists quick_queue_party_invites_insert_host on public.quick_queue_party_invites;
create policy quick_queue_party_invites_insert_host on public.quick_queue_party_invites
for insert to authenticated
with check (auth.uid() = host_user_id);

drop policy if exists quick_queue_party_invites_update_participants on public.quick_queue_party_invites;
create policy quick_queue_party_invites_update_participants on public.quick_queue_party_invites
for update to authenticated
using (auth.uid() = host_user_id or auth.uid() = invitee_user_id)
with check (auth.uid() = host_user_id or auth.uid() = invitee_user_id);

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

  select *
  into v_existing
  from public.quick_queue_party_invites q
  where q.host_user_id = v_host_user_id
    and q.invitee_user_id = p_invitee_user_id
  limit 1;

  if found then
    update public.quick_queue_party_invites q
    set mode = p_mode,
        team_size = p_team_size,
        stake_amount = p_stake_amount,
        status = 'pending',
        responded_at = null,
        updated_at = now()
    where q.id = v_existing.id;
  else
    insert into public.quick_queue_party_invites (
      host_user_id,
      invitee_user_id,
      mode,
      team_size,
      stake_amount,
      status
    ) values (
      v_host_user_id,
      p_invitee_user_id,
      p_mode,
      p_team_size,
      p_stake_amount,
      'pending'
    );
  end if;

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
      'mode', p_mode
    )
  );

  return 'sent';
end;
$$;

revoke all on function public.send_quick_queue_party_invite(uuid, public.ha_mode, integer, numeric) from public;
grant execute on function public.send_quick_queue_party_invite(uuid, public.ha_mode, integer, numeric) to authenticated;

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

    update public.quick_queue_party_invites q
    set status = 'cancelled',
        responded_at = now(),
        updated_at = now()
    where q.id = p_invite_id;

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
