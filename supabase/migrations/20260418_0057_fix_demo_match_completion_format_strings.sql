-- 20260418_0057_fix_demo_match_completion_format_strings.sql
-- Fix Postgres format() usage in demo match completion notifications.

create or replace function public.complete_demo_match_for_testing(
  p_match_id uuid,
  p_winning_side public.ha_team_side default 'T',
  p_winning_rounds integer default 13,
  p_losing_rounds integer default 3
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
  v_score_t integer;
  v_score_ct integer;
  v_total_matches integer := 0;
  v_total_wins integer := 0;
  v_total_losses integer := 0;
  v_total_kills integer := 0;
  v_total_deaths integer := 0;
  v_score_for integer := 0;
  v_score_against integer := 0;
begin
  if p_winning_side not in ('T', 'CT') then
    raise exception 'Winning side must be T or CT';
  end if;

  if coalesce(p_winning_rounds, 0) <= 0 then
    raise exception 'Winning rounds must be greater than zero';
  end if;

  if coalesce(p_losing_rounds, -1) < 0 then
    raise exception 'Losing rounds cannot be negative';
  end if;

  if p_losing_rounds >= p_winning_rounds then
    raise exception 'Winning rounds must be greater than losing rounds';
  end if;

  v_score_t := case when p_winning_side = 'T' then p_winning_rounds else p_losing_rounds end;
  v_score_ct := case when p_winning_side = 'CT' then p_winning_rounds else p_losing_rounds end;

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
        if v_balance_cents < v_stake_cents then
          raise exception 'Player % does not have enough demo balance to settle this match', v_player.user_id;
        end if;

        v_debit_cents := v_stake_cents;
        v_total_pot_cents := v_total_pot_cents + v_debit_cents;

        update public.wallets
        set demo_balance = (v_balance_cents - v_debit_cents)::numeric / 100,
            updated_at = now()
        where user_id = v_player.user_id;

        update public.match_players
        set payout_amount = ((-1 * v_debit_cents)::numeric / 100)
        where match_id = p_match_id
          and user_id = v_player.user_id;

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
    v_score_for := case when v_player.team_side = 'T' then v_score_t else v_score_ct end;
    v_score_against := case when v_player.team_side = 'T' then v_score_ct else v_score_t end;

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

    select
      count(*),
      count(*) filter (where mp.is_winner),
      count(*) filter (where mp.is_winner is false),
      coalesce(sum(mp.kills), 0),
      coalesce(sum(mp.deaths), 0)
    into v_total_matches, v_total_wins, v_total_losses, v_total_kills, v_total_deaths
    from public.match_players mp
    join public.matches m on m.id = mp.match_id
    where mp.user_id = v_player.user_id
      and m.mode = 'demo'
      and (m.status = 'finished' or m.id = p_match_id);

    v_new_level := greatest(coalesce((v_demo_stats ->> 'level')::integer, 1), 1) + case when v_is_winner then 1 else 0 end;
    v_new_win_rate := case
      when v_total_matches > 0 then format('%s%%', round((v_total_wins::numeric * 100) / v_total_matches))
      else '0%'
    end;
    v_new_kd_ratio := round((greatest(v_total_kills, 0)::numeric / greatest(v_total_deaths, 1)::numeric), 2);
    v_new_headshot_pct := case when v_total_kills > 0 then '35%' else '0%' end;
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
      'performance', v_new_performance,
      'totalMatches', v_total_matches,
      'wins', v_total_wins,
      'losses', v_total_losses
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
        when v_is_winner then format(
          'Victory %s-%s · You won %s USDT',
          v_score_for,
          v_score_against,
          to_char(greatest(v_user_delta, 0), 'FM999999990.00')
        )
        else format(
          'Defeat %s-%s · You lost %s USDT',
          v_score_for,
          v_score_against,
          to_char(abs(least(v_user_delta, 0)), 'FM999999990.00')
        )
      end,
      '/battlefield',
      jsonb_build_object(
        'match_id', p_match_id,
        'winner', v_is_winner,
        'payout_amount', v_user_delta,
        'stake_amount', coalesce(v_lobby.stake_amount, 0),
        'winning_side', p_winning_side,
        'score_t', v_score_t,
        'score_ct', v_score_ct,
        'score_for', v_score_for,
        'score_against', v_score_against,
        'result_popup', true
      )
    );
  end loop;

  update public.matches
  set status = 'finished',
      ended_at = now(),
      winning_side = p_winning_side,
      score_t = v_score_t,
      score_ct = v_score_ct
  where id = p_match_id;

  update public.lobbies
  set status = 'closed',
      close_reason = format('Demo test match completed (%s %s-%s)', p_winning_side, v_score_t, v_score_ct),
      updated_at = now()
  where id = v_match.lobby_id;
end;
$$;
