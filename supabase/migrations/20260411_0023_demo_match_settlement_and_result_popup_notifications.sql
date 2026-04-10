-- 20260411_0023_demo_match_settlement_and_result_popup_notifications.sql

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
        when v_is_winner then format('Congratulations! you won %.2f USDT', greatest(v_user_delta, 0))
        else format('You lose %.2f USDT staked on this server, better luck next time!', abs(least(v_user_delta, 0)))
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
