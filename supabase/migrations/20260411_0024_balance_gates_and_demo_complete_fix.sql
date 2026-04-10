-- 20260411_0024_balance_gates_and_demo_complete_fix.sql

create or replace function public.assert_user_has_required_lobby_balance(
  p_user_id uuid,
  p_mode public.ha_mode,
  p_stake_amount numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stake numeric(14,2) := greatest(coalesce(p_stake_amount, 0), 0);
  v_wallet public.wallets%rowtype;
begin
  if v_stake <= 0 then
    return;
  end if;

  select *
  into v_wallet
  from public.wallets
  where user_id = p_user_id;

  if not found then
    raise exception 'Wallet not found for user';
  end if;

  if p_mode = 'demo' and coalesce(v_wallet.demo_balance, 0) < v_stake then
    raise exception 'Insufficient demo balance. Required % USDT to join or play this lobby.',
      to_char(v_stake, 'FM999999990.00');
  end if;

  if p_mode = 'live' and coalesce(v_wallet.available_balance, 0) < v_stake then
    raise exception 'Insufficient live balance. Required % USDT to join or play this lobby.',
      to_char(v_stake, 'FM999999990.00');
  end if;
end;
$$;

create or replace function public.join_matchmaking_lobby(
  p_lobby_id uuid,
  p_password text default null
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

  if exists (
    select 1
    from public.lobby_members lm
    join public.lobbies l on l.id = lm.lobby_id
    where lm.user_id = v_user_id
      and lm.kicked_at is null
      and lm.left_at is null
      and l.status in ('open', 'in_progress')
      and l.id <> p_lobby_id
  ) then
    raise exception 'Leave your current lobby before joining another one';
  end if;

  select *
  into v_lobby
  from public.lobbies
  where id = p_lobby_id
  for update;

  if not found then
    raise exception 'Lobby not found';
  end if;

  if v_lobby.status <> 'open' then
    raise exception 'Only open lobbies can be joined';
  end if;

  perform public.assert_user_can_access_mode(v_user_id, v_lobby.mode);
  perform public.assert_user_has_required_lobby_balance(v_user_id, v_lobby.mode, v_lobby.stake_amount);

  if v_lobby.password_required then
    if nullif(trim(coalesce(p_password, '')), '') is null or v_lobby.password_hash is null or crypt(trim(p_password), v_lobby.password_hash) <> v_lobby.password_hash then
      raise exception 'Incorrect lobby password';
    end if;
  end if;

  select count(*)
  into v_active_members
  from public.lobby_members
  where lobby_id = p_lobby_id
    and kicked_at is null
    and left_at is null;

  if v_active_members >= v_lobby.max_players then
    raise exception 'Lobby is already full';
  end if;

  insert into public.lobby_members (lobby_id, user_id, team_side, is_ready)
  values (p_lobby_id, v_user_id, 'UNASSIGNED', false)
  on conflict (lobby_id, user_id) do update
  set left_at = null,
      kicked_at = null,
      joined_at = now(),
      team_side = 'UNASSIGNED',
      is_ready = false;

  perform public.refresh_lobby_auto_veto(p_lobby_id);
end;
$$;

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

create or replace function public.ensure_pending_lobby_match(
  p_lobby_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lobby public.lobbies%rowtype;
  v_match_id uuid;
  v_member record;
begin
  select *
  into v_lobby
  from public.lobbies
  where id = p_lobby_id
  for update;

  if not found then
    raise exception 'Lobby not found';
  end if;

  if coalesce(v_lobby.selected_map, '') = '' then
    raise exception 'A final map must be selected before preparing the server';
  end if;

  for v_member in
    select lm.user_id
    from public.lobby_members lm
    where lm.lobby_id = p_lobby_id
      and lm.kicked_at is null
      and lm.left_at is null
  loop
    perform public.assert_user_has_required_lobby_balance(v_member.user_id, v_lobby.mode, v_lobby.stake_amount);
  end loop;

  select id
  into v_match_id
  from public.matches
  where lobby_id = p_lobby_id
    and status in ('pending', 'live')
  limit 1;

  if v_match_id is null then
    insert into public.matches (
      lobby_id,
      mode,
      status,
      dedicated_server_id,
      dedicated_server_endpoint
    ) values (
      v_lobby.id,
      v_lobby.mode,
      'pending',
      'pending-allocation',
      public.build_match_server_endpoint(
        gen_random_uuid(),
        v_lobby.name,
        v_lobby.game_mode,
        v_lobby.selected_map,
        v_lobby.mode
      )
    )
    returning id into v_match_id;

    update public.matches
    set dedicated_server_endpoint = public.build_match_server_endpoint(
      v_match_id,
      v_lobby.name,
      v_lobby.game_mode,
      v_lobby.selected_map,
      v_lobby.mode
    )
    where id = v_match_id;

    insert into public.match_players (
      match_id,
      user_id,
      team_side,
      joined_server,
      joined_server_at
    )
    select
      v_match_id,
      lm.user_id,
      lm.team_side,
      false,
      null
    from public.lobby_members lm
    where lm.lobby_id = p_lobby_id
      and lm.kicked_at is null
      and lm.left_at is null;
  end if;

  return v_match_id;
end;
$$;

create or replace function public.complete_demo_match_for_testing(
  p_match_id uuid,
  p_winning_side public.ha_team_side default 'T'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_role public.ha_role;
  v_match public.matches%rowtype;
  v_lobby public.lobbies%rowtype;
  v_player record;
  v_index integer := 0;
  v_demo_stats jsonb;
  v_new_level integer;
  v_new_win_rate text;
  v_new_kd_ratio numeric(10,2);
  v_new_headshot_pct text;
  v_new_performance jsonb;
  v_is_winner boolean;
  v_kills integer;
  v_deaths integer;
  v_assists integer;
  v_round_score integer;
  v_stake_cents bigint := 0;
  v_total_pot_cents bigint := 0;
  v_winner_count integer := 0;
  v_base_win_cents bigint := 0;
  v_remainder_cents bigint := 0;
  v_credit_cents bigint := 0;
  v_debit_cents bigint := 0;
  v_wallet_balance numeric(14,2) := 0;
  v_balance_cents bigint := 0;
  v_user_delta numeric(14,2) := 0;
  v_winner_ids uuid[] := array[]::uuid[];
begin
  select role into v_actor_role from public.profiles where id = v_actor_id;

  select *
  into v_match
  from public.matches
  where id = p_match_id
  for update;

  if not found then
    raise exception 'Match not found';
  end if;

  if v_match.mode <> 'demo' then
    raise exception 'This helper only supports demo matches';
  end if;

  if v_match.status <> 'live' then
    raise exception 'Only live demo matches can be completed through testing';
  end if;

  select *
  into v_lobby
  from public.lobbies
  where id = v_match.lobby_id;

  if not found then
    raise exception 'Lobby not found for the match';
  end if;

  if v_lobby.leader_id <> v_actor_id and v_actor_role is distinct from 'admin' then
    raise exception 'Only the lobby leader or an admin can complete a demo test match';
  end if;

  v_stake_cents := greatest(round(coalesce(v_lobby.stake_amount, 0) * 100), 0);

  if v_stake_cents > 0 then
    for v_player in
      select mp.user_id, mp.team_side
      from public.match_players mp
      where mp.match_id = p_match_id
      order by mp.user_id
    loop
      if v_player.team_side = p_winning_side then
        v_winner_ids := array_append(v_winner_ids, v_player.user_id);
      else
        select coalesce(demo_balance, 0)
        into v_wallet_balance
        from public.wallets
        where user_id = v_player.user_id
        for update;

        v_balance_cents := greatest(round(coalesce(v_wallet_balance, 0) * 100), 0);
        v_debit_cents := least(v_balance_cents, v_stake_cents);
        v_total_pot_cents := v_total_pot_cents + v_debit_cents;

        update public.wallets
        set demo_balance = (v_balance_cents - v_debit_cents)::numeric / 100,
            updated_at = now()
        where user_id = v_player.user_id;

        update public.match_players
        set payout_amount = ((-1 * v_debit_cents)::numeric / 100)
        where match_id = p_match_id
          and user_id = v_player.user_id;

        if v_debit_cents > 0 then
          insert into public.wallet_ledger (user_id, entry_type, mode, amount, note, reference_type, reference_id)
          values (
            v_player.user_id,
            'demo_match_stake_lost',
            'demo',
            ((-1 * v_debit_cents)::numeric / 100),
            'Demo match loss stake deduction',
            'match',
            p_match_id::text
          );
        end if;
      end if;
    end loop;

    v_winner_count := coalesce(array_length(v_winner_ids, 1), 0);

    if v_winner_count > 0 and v_total_pot_cents > 0 then
      v_base_win_cents := v_total_pot_cents / v_winner_count;
      v_remainder_cents := v_total_pot_cents % v_winner_count;

      for v_index in 1..v_winner_count loop
        v_credit_cents := v_base_win_cents + case when v_index <= v_remainder_cents then 1 else 0 end;

        update public.wallets
        set demo_balance = demo_balance + (v_credit_cents::numeric / 100),
            updated_at = now()
        where user_id = v_winner_ids[v_index];

        update public.match_players
        set payout_amount = (v_credit_cents::numeric / 100)
        where match_id = p_match_id
          and user_id = v_winner_ids[v_index];

        if v_credit_cents > 0 then
          insert into public.wallet_ledger (user_id, entry_type, mode, amount, note, reference_type, reference_id)
          values (
            v_winner_ids[v_index],
            'demo_match_stake_won',
            'demo',
            (v_credit_cents::numeric / 100),
            'Demo match win payout',
            'match',
            p_match_id::text
          );
        end if;
      end loop;
    end if;
  else
    update public.match_players
    set payout_amount = 0
    where match_id = p_match_id;
  end if;

  for v_player in
    select mp.user_id, mp.team_side, coalesce(mp.payout_amount, 0) as payout_amount
    from public.match_players mp
    where mp.match_id = p_match_id
    order by mp.user_id
  loop
    v_index := v_index + 1;
    v_is_winner := v_player.team_side = p_winning_side;
    v_kills := case when v_is_winner then 18 + (v_index % 7) else 8 + (v_index % 5) end;
    v_deaths := case when v_is_winner then 10 + (v_index % 4) else 15 + (v_index % 6) end;
    v_assists := 4 + (v_index % 6);
    v_round_score := case when v_is_winner then 95 + (v_index * 4) else 55 + (v_index * 3) end;
    v_user_delta := coalesce(v_player.payout_amount, 0);

    update public.match_players
    set kills = v_kills,
        deaths = v_deaths,
        assists = v_assists,
        round_score = v_round_score,
        is_winner = v_is_winner,
        joined_server = true,
        joined_server_at = coalesce(joined_server_at, now())
    where match_id = p_match_id
      and user_id = v_player.user_id;

    select coalesce(demo_stats, '{}'::jsonb)
    into v_demo_stats
    from public.profiles
    where id = v_player.user_id
    for update;

    v_new_level := greatest(coalesce((v_demo_stats ->> 'level')::integer, 1), 1) + case when v_is_winner then 1 else 0 end;
    v_new_win_rate := case when v_is_winner then '100%' else coalesce(v_demo_stats ->> 'winRate', '0%') end;
    v_new_kd_ratio := round((greatest(v_kills, 0)::numeric / greatest(v_deaths, 1)::numeric), 2);
    v_new_headshot_pct := case when v_kills > 0 then '35%' else '0%' end;
    v_new_performance := public.append_recent_performance_score(
      coalesce(v_demo_stats -> 'performance', '[0,0,0,0,0,0,0,0,0,0]'::jsonb),
      v_round_score
    );

    update public.profiles
    set demo_stats = jsonb_build_object(
      'level', v_new_level,
      'rank', case when v_is_winner then 'Demo Vanguard' else coalesce(v_demo_stats ->> 'rank', 'Demo Cadet') end,
      'winRate', v_new_win_rate,
      'kdRatio', v_new_kd_ratio,
      'headshotPct', v_new_headshot_pct,
      'performance', v_new_performance
    ),
        updated_at = now()
    where id = v_player.user_id;

    perform public.create_notification(
      v_player.user_id,
      'demo_match_completed',
      case
        when v_is_winner then 'Congratulations! You won'
        else 'Demo match result: better luck next time'
      end,
      case
        when v_is_winner then 'Congratulations! you won ' || to_char(greatest(v_user_delta, 0), 'FM999999990.00') || ' USDT'
        else 'You lose ' || to_char(abs(least(v_user_delta, 0)), 'FM999999990.00') || ' USDT staked on this server, better luck next time!'
      end,
      '/battlefield',
      jsonb_build_object(
        'match_id', p_match_id,
        'winner', v_is_winner,
        'payout_amount', v_user_delta,
        'stake_amount', coalesce(v_lobby.stake_amount, 0),
        'winning_side', p_winning_side,
        'result_popup', true
      )
    );
  end loop;

  update public.matches
  set status = 'finished',
      ended_at = now()
  where id = p_match_id;

  update public.lobbies
  set status = 'closed',
      close_reason = 'Demo test match completed',
      updated_at = now()
  where id = v_match.lobby_id;
end;
$$;
