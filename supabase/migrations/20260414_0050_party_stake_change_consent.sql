-- 20260414_0050_party_stake_change_consent.sql
-- Party leader-controlled stake updates with teammate consent.

create table if not exists public.quick_queue_party_stake_updates (
  id bigint generated always as identity primary key,
  host_user_id uuid not null references public.profiles(id) on delete cascade,
  invitee_user_id uuid not null references public.profiles(id) on delete cascade,
  mode public.ha_mode not null,
  team_size integer not null check (team_size in (2, 5)),
  previous_stake_amount numeric(14,2) not null check (previous_stake_amount >= 5 and previous_stake_amount <= 1000),
  new_stake_amount numeric(14,2) not null check (new_stake_amount >= 5 and new_stake_amount <= 1000),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  responded_at timestamptz
);

create index if not exists idx_quick_queue_party_stake_updates_host
  on public.quick_queue_party_stake_updates(host_user_id, mode, team_size, status, created_at desc);

create index if not exists idx_quick_queue_party_stake_updates_invitee
  on public.quick_queue_party_stake_updates(invitee_user_id, mode, team_size, status, created_at desc);

create unique index if not exists uq_quick_queue_party_stake_updates_pending
  on public.quick_queue_party_stake_updates(host_user_id, invitee_user_id, mode, team_size)
  where status = 'pending';

alter table public.quick_queue_party_stake_updates enable row level security;

drop policy if exists quick_queue_party_stake_updates_select_self on public.quick_queue_party_stake_updates;
create policy quick_queue_party_stake_updates_select_self
  on public.quick_queue_party_stake_updates
  for select
  using (auth.uid() = host_user_id or auth.uid() = invitee_user_id);

create or replace function public.request_quick_queue_party_stake_update(
  p_mode public.ha_mode,
  p_team_size integer,
  p_previous_stake_amount numeric,
  p_new_stake_amount numeric
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_previous numeric(14,2) := greatest(coalesce(p_previous_stake_amount, 0), 0);
  v_new numeric(14,2) := greatest(coalesce(p_new_stake_amount, 0), 0);
  v_sent_count integer := 0;
  v_invite record;
  v_update_id bigint;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_team_size not in (2, 5) then
    raise exception 'Unsupported team size';
  end if;

  if v_previous < 5 or v_previous > 1000 or v_new < 5 or v_new > 1000 then
    raise exception 'Stake amount must be between 5 and 1000 USDT';
  end if;

  if v_previous = v_new then
    raise exception 'Stake amount did not change';
  end if;

  for v_invite in
    select q.invitee_user_id
    from public.quick_queue_party_invites q
    where q.host_user_id = v_user_id
      and q.mode = p_mode
      and q.team_size = p_team_size
      and q.stake_amount = v_previous
      and q.status = 'accepted'
  loop
    insert into public.quick_queue_party_stake_updates (
      host_user_id,
      invitee_user_id,
      mode,
      team_size,
      previous_stake_amount,
      new_stake_amount,
      status,
      updated_at
    ) values (
      v_user_id,
      v_invite.invitee_user_id,
      p_mode,
      p_team_size,
      v_previous,
      v_new,
      'pending',
      now()
    )
    on conflict (host_user_id, invitee_user_id, mode, team_size) where status = 'pending'
    do update
      set previous_stake_amount = excluded.previous_stake_amount,
          new_stake_amount = excluded.new_stake_amount,
          updated_at = now()
    returning id into v_update_id;

    perform public.create_notification(
      v_invite.invitee_user_id,
      'party_stake_update',
      'Party Stake Updated',
      'Party Leader Has Changed The Staking Amount',
      '/battlefield',
      jsonb_build_object(
        'stake_update_id', v_update_id,
        'host_user_id', v_user_id,
        'previous_stake_amount', v_previous,
        'new_stake_amount', v_new,
        'team_size', p_team_size
      )
    );

    v_sent_count := v_sent_count + 1;
  end loop;

  return v_sent_count;
end;
$$;

revoke all on function public.request_quick_queue_party_stake_update(public.ha_mode, integer, numeric, numeric) from public;
grant execute on function public.request_quick_queue_party_stake_update(public.ha_mode, integer, numeric, numeric) to authenticated;

create or replace function public.respond_quick_queue_party_stake_update(
  p_stake_update_id bigint,
  p_action text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_update public.quick_queue_party_stake_updates%rowtype;
  v_actor_username text;
  v_result text;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_action not in ('accept', 'decline') then
    raise exception 'Unsupported action';
  end if;

  select *
  into v_update
  from public.quick_queue_party_stake_updates u
  where u.id = p_stake_update_id
  for update;

  if not found then
    raise exception 'Stake update request not found';
  end if;

  if v_update.status <> 'pending' then
    return v_update.status;
  end if;

  if v_update.invitee_user_id <> v_user_id then
    raise exception 'Only the invited teammate can respond';
  end if;

  v_result := case when p_action = 'accept' then 'accepted' else 'declined' end;

  update public.quick_queue_party_stake_updates u
  set status = v_result,
      responded_at = now(),
      updated_at = now()
  where u.id = p_stake_update_id;

  if p_action = 'accept' then
    update public.quick_queue_party_invites q
    set stake_amount = v_update.new_stake_amount,
        updated_at = now()
    where q.host_user_id = v_update.host_user_id
      and q.invitee_user_id = v_update.invitee_user_id
      and q.mode = v_update.mode
      and q.team_size = v_update.team_size
      and q.status = 'accepted'
      and q.stake_amount = v_update.previous_stake_amount;
  end if;

  select coalesce(nullif(trim(username), ''), split_part(email, '@', 1), 'Player')
  into v_actor_username
  from public.profiles
  where id = v_user_id;

  perform public.create_notification(
    v_update.host_user_id,
    'party_stake_update_response',
    'Party Stake Update Response',
    coalesce(v_actor_username, 'Your teammate') ||
      case when p_action = 'accept'
        then ' accepted the new staking amount.'
        else ' declined the new staking amount.'
      end,
    '/battlefield',
    jsonb_build_object(
      'stake_update_id', p_stake_update_id,
      'invitee_user_id', v_update.invitee_user_id,
      'status', v_result,
      'previous_stake_amount', v_update.previous_stake_amount,
      'new_stake_amount', v_update.new_stake_amount,
      'team_size', v_update.team_size
    )
  );

  return v_result;
end;
$$;

revoke all on function public.respond_quick_queue_party_stake_update(bigint, text) from public;
grant execute on function public.respond_quick_queue_party_stake_update(bigint, text) to authenticated;
