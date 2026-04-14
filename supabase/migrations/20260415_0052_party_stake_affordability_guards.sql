-- 20260415_0052_party_stake_affordability_guards.sql
-- Enforce party-wide balance checks for stake updates and expose party affordability cap for UI disabling.

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
  v_host_balance numeric(14,2) := 0;
  v_insufficient_count integer := 0;
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

  select coalesce(
           case
             when p_mode = 'demo' then w.demo_balance
             else w.available_balance
           end,
           0
         )
  into v_host_balance
  from public.wallets w
  where w.user_id = v_user_id;

  if coalesce(v_host_balance, 0) < v_new then
    raise exception 'You do not have enough balance for % USDT', v_new;
  end if;

  select count(*)
  into v_insufficient_count
  from public.quick_queue_party_invites q
  left join public.wallets w on w.user_id = q.invitee_user_id
  where q.host_user_id = v_user_id
    and q.mode = p_mode
    and q.team_size = p_team_size
    and q.stake_amount = v_previous
    and q.status = 'accepted'
    and coalesce(
          case
            when p_mode = 'demo' then w.demo_balance
            else w.available_balance
          end,
          0
        ) < v_new;

  if v_insufficient_count > 0 then
    raise exception 'One or more party members do not have enough balance for % USDT', v_new;
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

create or replace function public.get_quick_queue_party_stake_cap(
  p_mode public.ha_mode,
  p_team_size integer
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_min_balance numeric(14,2);
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_team_size not in (2, 5) then
    raise exception 'Unsupported team size';
  end if;

  with party_members as (
    select v_user_id as user_id
    union
    select q.invitee_user_id
    from public.quick_queue_party_invites q
    where q.host_user_id = v_user_id
      and q.mode = p_mode
      and q.team_size = p_team_size
      and q.status = 'accepted'
  )
  select min(
           coalesce(
             case
               when p_mode = 'demo' then w.demo_balance
               else w.available_balance
             end,
             0
           )
         )
  into v_min_balance
  from party_members m
  left join public.wallets w on w.user_id = m.user_id;

  return coalesce(v_min_balance, 0);
end;
$$;

revoke all on function public.get_quick_queue_party_stake_cap(public.ha_mode, integer) from public;
grant execute on function public.get_quick_queue_party_stake_cap(public.ha_mode, integer) to authenticated;
