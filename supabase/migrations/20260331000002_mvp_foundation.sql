CREATE EXTENSION IF NOT EXISTS pgcrypto;

UPDATE public.profiles
SET kyc_status = CASE
  WHEN kyc_status = 'approved' THEN 'verified'
  WHEN kyc_status = 'rejected' THEN 'rejected'
  ELSE 'pending'
END;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_kyc_status_check;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS display_name TEXT,
ADD COLUMN IF NOT EXISTS bio TEXT,
ADD COLUMN IF NOT EXISTS steam_handle TEXT,
ADD COLUMN IF NOT EXISTS country_code TEXT,
ADD COLUMN IF NOT EXISTS rank_tier TEXT,
ADD COLUMN IF NOT EXISTS total_matches INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS wins INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS losses INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_earnings DECIMAL(20, 8) DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_volume DECIMAL(20, 8) DEFAULT 0,
ADD COLUMN IF NOT EXISTS preferred_maps TEXT[] DEFAULT '{}'::TEXT[],
ADD COLUMN IF NOT EXISTS kyc_rejection_reason TEXT;

UPDATE public.profiles
SET display_name = COALESCE(display_name, username),
    total_earnings = COALESCE(total_earnings, COALESCE(total_winnings, 0));

ALTER TABLE public.profiles
ALTER COLUMN display_name SET NOT NULL;

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_kyc_status_check CHECK (kyc_status IN ('pending', 'verified', 'rejected'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_username_lower ON public.profiles ((LOWER(username)));

CREATE OR REPLACE FUNCTION public.generate_unique_username(raw_seed TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base_username TEXT;
  candidate TEXT;
  suffix INTEGER := 0;
BEGIN
  base_username := LOWER(REGEXP_REPLACE(COALESCE(NULLIF(raw_seed, ''), 'player'), '[^a-zA-Z0-9]+', '', 'g'));
  base_username := LEFT(base_username, 18);

  IF base_username = '' THEN
    base_username := 'player';
  END IF;

  candidate := base_username;

  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE LOWER(username) = LOWER(candidate)) LOOP
    suffix := suffix + 1;
    candidate := LEFT(base_username, GREATEST(4, 18 - LENGTH(suffix::TEXT))) || suffix::TEXT;
  END LOOP;

  RETURN candidate;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  generated_username TEXT;
BEGIN
  generated_username := public.generate_unique_username(
    COALESCE(new.raw_user_meta_data->>'username', SPLIT_PART(COALESCE(new.email, ''), '@', 1))
  );

  INSERT INTO public.profiles (
    id,
    username,
    display_name,
    avatar_url,
    kyc_status
  )
  VALUES (
    new.id,
    generated_username,
    COALESCE(NULLIF(new.raw_user_meta_data->>'full_name', ''), generated_username),
    new.raw_user_meta_data->>'avatar_url',
    'pending'
  )
  ON CONFLICT (id) DO UPDATE
  SET username = EXCLUDED.username,
      display_name = COALESCE(public.profiles.display_name, EXCLUDED.display_name),
      avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url),
      updated_at = NOW();

  INSERT INTO public.wallets (user_id)
  VALUES (new.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN new;
END;
$$;

ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_type_check;
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_status_check;

ALTER TABLE public.transactions
ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
ADD COLUMN IF NOT EXISTS reference_type TEXT,
ADD COLUMN IF NOT EXISTS reference_id TEXT,
ADD COLUMN IF NOT EXISTS balance_before DECIMAL(20, 8) DEFAULT 0,
ADD COLUMN IF NOT EXISTS balance_after DECIMAL(20, 8) DEFAULT 0,
ADD COLUMN IF NOT EXISTS locked_before DECIMAL(20, 8) DEFAULT 0,
ADD COLUMN IF NOT EXISTS locked_after DECIMAL(20, 8) DEFAULT 0,
ADD COLUMN IF NOT EXISTS notes TEXT,
ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

UPDATE public.transactions
SET processed_at = COALESCE(processed_at, created_at)
WHERE status = 'completed';

ALTER TABLE public.transactions
ADD CONSTRAINT transactions_type_check CHECK (
  type IN (
    'deposit',
    'withdraw_request',
    'withdraw_complete',
    'withdraw_rejected',
    'stake_lock',
    'stake_release',
    'match_payout',
    'vip_purchase',
    'adjustment'
  )
);

ALTER TABLE public.transactions
ADD CONSTRAINT transactions_status_check CHECK (status IN ('pending', 'completed', 'failed', 'cancelled'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_idempotency_key
ON public.transactions (idempotency_key)
WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_reference
ON public.transactions (reference_type, reference_id);

ALTER TABLE public.wallet_audit_logs
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::JSONB;

CREATE TABLE IF NOT EXISTS public.kyc_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  legal_name TEXT NOT NULL,
  date_of_birth DATE NOT NULL,
  country_code TEXT NOT NULL,
  document_type TEXT NOT NULL,
  document_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
  notes TEXT,
  reviewed_by UUID REFERENCES public.profiles(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.withdrawal_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount DECIMAL(20, 8) NOT NULL CHECK (amount > 0),
  network TEXT NOT NULL CHECK (network IN ('TRC20', 'BEP20')),
  wallet_address TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'rejected')),
  transaction_id UUID REFERENCES public.transactions(id),
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.match_queue_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  match_mode TEXT NOT NULL CHECK (match_mode IN ('competitive', 'wingman', 'ffa')),
  wager_amount DECIMAL(20, 8) NOT NULL CHECK (wager_amount >= 0),
  region TEXT NOT NULL DEFAULT 'global',
  elo_rating INTEGER NOT NULL DEFAULT 1000,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, match_mode, wager_amount)
);

ALTER TABLE public.match_queue_entries
ADD COLUMN IF NOT EXISTS wager_amount DECIMAL(20, 8) DEFAULT 0;

UPDATE public.matches
SET status = CASE
  WHEN status = 'waiting' THEN 'forming'
  WHEN status = 'live' THEN 'live'
  WHEN status = 'completed' THEN 'completed'
  ELSE 'cancelled'
END,
    winner_team = CASE
      WHEN winner_team = 'draw' THEN NULL
      ELSE winner_team
    END,
    game_mode = CASE
      WHEN game_mode = 'team_ffa' THEN 'ffa'
      ELSE COALESCE(game_mode, 'competitive')
    END;

ALTER TABLE public.matches DROP CONSTRAINT IF EXISTS matches_status_check;
ALTER TABLE public.matches DROP CONSTRAINT IF EXISTS matches_winner_team_check;
ALTER TABLE public.matches DROP CONSTRAINT IF EXISTS matches_game_mode_check;

ALTER TABLE public.matches
ADD COLUMN IF NOT EXISTS title TEXT DEFAULT 'Arena Lobby',
ADD COLUMN IF NOT EXISTS queue_type TEXT DEFAULT 'custom',
ADD COLUMN IF NOT EXISTS phase TEXT DEFAULT 'team_select',
ADD COLUMN IF NOT EXISTS region TEXT DEFAULT 'global',
ADD COLUMN IF NOT EXISTS room_code TEXT,
ADD COLUMN IF NOT EXISTS map_pool TEXT[] DEFAULT ARRAY['Dust2', 'Inferno', 'Nuke', 'Mirage', 'Vertigo', 'Ancient', 'Cache']::TEXT[],
ADD COLUMN IF NOT EXISTS ready_deadline TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS server_callback_key TEXT,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.matches
ALTER COLUMN game_mode SET DEFAULT 'competitive';

ALTER TABLE public.matches
ADD CONSTRAINT matches_status_check CHECK (status IN ('forming', 'ready_check', 'map_vote', 'live', 'completed', 'cancelled'));

ALTER TABLE public.matches
ADD CONSTRAINT matches_winner_team_check CHECK (winner_team IN ('A', 'B', 'solo') OR winner_team IS NULL);

ALTER TABLE public.matches
ADD CONSTRAINT matches_game_mode_check CHECK (game_mode IN ('competitive', 'wingman', 'ffa'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_matches_room_code ON public.matches (room_code) WHERE room_code IS NOT NULL;

ALTER TABLE public.match_players DROP CONSTRAINT IF EXISTS match_players_team_check;

ALTER TABLE public.match_players
ADD COLUMN IF NOT EXISTS slot_index INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS is_captain BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS ready_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS elo_before INTEGER,
ADD COLUMN IF NOT EXISTS elo_after INTEGER,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.match_players
ADD CONSTRAINT match_players_team_check CHECK (team IN ('A', 'B', 'solo'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_match_players_slot
ON public.match_players (match_id, slot_index);

CREATE TABLE IF NOT EXISTS public.match_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.match_results (
  match_id UUID PRIMARY KEY REFERENCES public.matches(id) ON DELETE CASCADE,
  winner_team TEXT NOT NULL,
  stats JSONB NOT NULL DEFAULT '[]'::JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  settled_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.match_player_stats (
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kills INTEGER NOT NULL DEFAULT 0,
  deaths INTEGER NOT NULL DEFAULT 0,
  assists INTEGER NOT NULL DEFAULT 0,
  adr NUMERIC(10, 2) NOT NULL DEFAULT 0,
  headshot_pct NUMERIC(10, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (match_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.risk_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  match_id UUID REFERENCES public.matches(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('anti_cheat', 'fraud_signal', 'wallet_alert', 'ops_review')),
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS update_transactions_updated_at ON public.transactions;
CREATE TRIGGER update_transactions_updated_at
BEFORE UPDATE ON public.transactions
FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_kyc_submissions_updated_at ON public.kyc_submissions;
CREATE TRIGGER update_kyc_submissions_updated_at
BEFORE UPDATE ON public.kyc_submissions
FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_withdrawal_requests_updated_at ON public.withdrawal_requests;
CREATE TRIGGER update_withdrawal_requests_updated_at
BEFORE UPDATE ON public.withdrawal_requests
FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_matches_updated_at ON public.matches;
CREATE TRIGGER update_matches_updated_at
BEFORE UPDATE ON public.matches
FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_match_players_updated_at ON public.match_players;
CREATE TRIGGER update_match_players_updated_at
BEFORE UPDATE ON public.match_players
FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();

ALTER TABLE public.kyc_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_queue_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_player_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own KYC submissions"
ON public.kyc_submissions
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create own KYC submissions"
ON public.kyc_submissions
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own withdrawal requests"
ON public.withdrawal_requests
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can view own queue entries"
ON public.match_queue_entries
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create own queue entries"
ON public.match_queue_entries
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view match events"
ON public.match_events
FOR SELECT
USING (true);

CREATE POLICY "Users can view match results"
ON public.match_results
FOR SELECT
USING (true);

CREATE POLICY "Users can view match player stats"
ON public.match_player_stats
FOR SELECT
USING (true);

CREATE POLICY "Users can view own risk events"
ON public.risk_events
FOR SELECT
USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.record_risk_event(
  p_user_id UUID,
  p_match_id UUID,
  p_event_type TEXT,
  p_severity TEXT,
  p_payload JSONB DEFAULT '{}'::JSONB
)
RETURNS public.risk_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event public.risk_events;
BEGIN
  INSERT INTO public.risk_events (user_id, match_id, event_type, severity, payload)
  VALUES (p_user_id, p_match_id, p_event_type, p_severity, COALESCE(p_payload, '{}'::JSONB))
  RETURNING * INTO v_event;

  RETURN v_event;
END;
$$;

CREATE OR REPLACE FUNCTION public.wallet_apply_operation(
  p_user_id UUID,
  p_amount DECIMAL(20, 8),
  p_locked_delta DECIMAL(20, 8),
  p_type TEXT,
  p_status TEXT DEFAULT 'completed',
  p_idempotency_key TEXT DEFAULT NULL,
  p_network TEXT DEFAULT NULL,
  p_reference_type TEXT DEFAULT NULL,
  p_reference_id TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS public.transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet public.wallets;
  v_existing public.transactions;
  v_transaction public.transactions;
  v_new_balance DECIMAL(20, 8);
  v_new_locked DECIMAL(20, 8);
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    SELECT *
    INTO v_existing
    FROM public.transactions
    WHERE idempotency_key = p_idempotency_key
    LIMIT 1;

    IF FOUND THEN
      RETURN v_existing;
    END IF;
  END IF;

  INSERT INTO public.wallets (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT *
  INTO v_wallet
  FROM public.wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

  v_new_balance := COALESCE(v_wallet.balance, 0) + COALESCE(p_amount, 0);
  v_new_locked := COALESCE(v_wallet.locked_balance, 0) + COALESCE(p_locked_delta, 0);

  IF v_new_balance < 0 THEN
    RAISE EXCEPTION 'INSUFFICIENT_AVAILABLE_BALANCE';
  END IF;

  IF v_new_locked < 0 THEN
    RAISE EXCEPTION 'INSUFFICIENT_LOCKED_BALANCE';
  END IF;

  UPDATE public.wallets
  SET balance = v_new_balance,
      locked_balance = v_new_locked,
      updated_at = NOW()
  WHERE user_id = p_user_id;

  INSERT INTO public.transactions (
    user_id,
    type,
    amount,
    status,
    network,
    idempotency_key,
    reference_type,
    reference_id,
    balance_before,
    balance_after,
    locked_before,
    locked_after,
    notes,
    metadata,
    processed_at
  )
  VALUES (
    p_user_id,
    p_type,
    COALESCE(p_amount, 0),
    p_status,
    p_network,
    p_idempotency_key,
    p_reference_type,
    p_reference_id,
    COALESCE(v_wallet.balance, 0),
    v_new_balance,
    COALESCE(v_wallet.locked_balance, 0),
    v_new_locked,
    p_notes,
    COALESCE(p_metadata, '{}'::JSONB),
    CASE
      WHEN p_status = 'completed' THEN NOW()
      ELSE NULL
    END
  )
  RETURNING * INTO v_transaction;

  INSERT INTO public.wallet_audit_logs (
    user_id,
    old_balance,
    new_balance,
    old_locked_balance,
    new_locked_balance,
    reason,
    reference_id,
    metadata
  )
  VALUES (
    p_user_id,
    COALESCE(v_wallet.balance, 0),
    v_new_balance,
    COALESCE(v_wallet.locked_balance, 0),
    v_new_locked,
    p_type,
    p_reference_id::UUID,
    COALESCE(p_metadata, '{}'::JSONB)
  );

  RETURN v_transaction;
END;
$$;

CREATE OR REPLACE FUNCTION public.wallet_request_withdrawal(
  p_user_id UUID,
  p_amount DECIMAL(20, 8),
  p_network TEXT,
  p_wallet_address TEXT,
  p_idempotency_key TEXT
)
RETURNS public.withdrawal_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_transaction public.transactions;
  v_request public.withdrawal_requests;
  v_transaction public.transactions;
BEGIN
  SELECT *
  INTO v_existing_transaction
  FROM public.transactions
  WHERE idempotency_key = p_idempotency_key
  LIMIT 1;

  IF FOUND THEN
    SELECT *
    INTO v_request
    FROM public.withdrawal_requests
    WHERE id = v_existing_transaction.reference_id::UUID;

    RETURN v_request;
  END IF;

  INSERT INTO public.withdrawal_requests (
    user_id,
    amount,
    network,
    wallet_address
  )
  VALUES (
    p_user_id,
    p_amount,
    p_network,
    p_wallet_address
  )
  RETURNING * INTO v_request;

  SELECT *
  INTO v_transaction
  FROM public.wallet_apply_operation(
    p_user_id,
    p_amount * -1,
    0,
    'withdraw_request',
    'pending',
    p_idempotency_key,
    p_network,
    'withdrawal_request',
    v_request.id::TEXT,
    'Withdrawal request created',
    jsonb_build_object('wallet_address', p_wallet_address)
  );

  UPDATE public.withdrawal_requests
  SET transaction_id = v_transaction.id
  WHERE id = v_request.id
  RETURNING * INTO v_request;

  RETURN v_request;
END;
$$;

CREATE OR REPLACE FUNCTION public.wallet_purchase_vip(
  p_user_id UUID,
  p_plan_type TEXT,
  p_idempotency_key TEXT
)
RETURNS public.vip_subscriptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_transaction public.transactions;
  v_subscription public.vip_subscriptions;
  v_current_expiry TIMESTAMPTZ;
  v_next_expiry TIMESTAMPTZ;
  v_price DECIMAL(20, 8);
BEGIN
  SELECT *
  INTO v_existing_transaction
  FROM public.transactions
  WHERE idempotency_key = p_idempotency_key
  LIMIT 1;

  IF FOUND THEN
    SELECT *
    INTO v_subscription
    FROM public.vip_subscriptions
    WHERE id = v_existing_transaction.reference_id::UUID;

    RETURN v_subscription;
  END IF;

  IF p_plan_type = 'monthly' THEN
    v_price := 30;
  ELSIF p_plan_type = 'yearly' THEN
    v_price := 300;
  ELSE
    RAISE EXCEPTION 'INVALID_VIP_PLAN';
  END IF;

  SELECT COALESCE(vip_expires_at, NOW())
  INTO v_current_expiry
  FROM public.profiles
  WHERE id = p_user_id;

  v_next_expiry := CASE
    WHEN p_plan_type = 'monthly' THEN GREATEST(v_current_expiry, NOW()) + INTERVAL '1 month'
    ELSE GREATEST(v_current_expiry, NOW()) + INTERVAL '1 year'
  END;

  INSERT INTO public.vip_subscriptions (
    user_id,
    plan_type,
    amount_paid,
    expires_at
  )
  VALUES (
    p_user_id,
    p_plan_type,
    v_price,
    v_next_expiry
  )
  RETURNING * INTO v_subscription;

  PERFORM public.wallet_apply_operation(
    p_user_id,
    v_price * -1,
    0,
    'vip_purchase',
    'completed',
    p_idempotency_key,
    NULL,
    'vip_subscription',
    v_subscription.id::TEXT,
    'VIP subscription purchased',
    jsonb_build_object('plan_type', p_plan_type, 'expires_at', v_next_expiry)
  );

  UPDATE public.profiles
  SET is_vip = TRUE,
      vip_expires_at = v_next_expiry,
      updated_at = NOW()
  WHERE id = p_user_id;

  RETURN v_subscription;
END;
$$;

CREATE OR REPLACE FUNCTION public.settle_match_result(
  p_match_id UUID,
  p_winner_team TEXT,
  p_callback_key TEXT,
  p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match public.matches;
  v_player RECORD;
  v_player_count INTEGER;
  v_winner_count INTEGER;
  v_gross_per_winner DECIMAL(20, 8);
  v_fee DECIMAL(20, 8);
  v_net DECIMAL(20, 8);
  v_total_fee DECIMAL(20, 8) := 0;
BEGIN
  SELECT *
  INTO v_match
  FROM public.matches
  WHERE id = p_match_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MATCH_NOT_FOUND';
  END IF;

  IF v_match.status = 'completed' THEN
    RETURN jsonb_build_object(
      'match_id', v_match.id,
      'status', 'completed',
      'already_processed', TRUE
    );
  END IF;

  IF COALESCE(v_match.server_callback_key, '') <> COALESCE(p_callback_key, '') THEN
    RAISE EXCEPTION 'INVALID_CALLBACK_KEY';
  END IF;

  SELECT COUNT(*)
  INTO v_player_count
  FROM public.match_players
  WHERE match_id = p_match_id;

  SELECT COUNT(*)
  INTO v_winner_count
  FROM public.match_players
  WHERE match_id = p_match_id
    AND team = p_winner_team;

  IF v_player_count = 0 OR v_winner_count = 0 THEN
    RAISE EXCEPTION 'MATCH_SETTLEMENT_INVALID';
  END IF;

  v_gross_per_winner := (COALESCE(v_match.wager_amount, 0) * v_player_count) / v_winner_count;

  FOR v_player IN
    SELECT
      mp.user_id,
      mp.team,
      COALESCE(p.vip_expires_at > NOW(), FALSE) AS vip_active
    FROM public.match_players mp
    JOIN public.profiles p ON p.id = mp.user_id
    WHERE mp.match_id = p_match_id
  LOOP
    PERFORM public.wallet_apply_operation(
      v_player.user_id,
      0,
      COALESCE(v_match.wager_amount, 0) * -1,
      'stake_release',
      'completed',
      p_match_id::TEXT || ':release:' || v_player.user_id::TEXT,
      NULL,
      'match',
      p_match_id::TEXT,
      'Stake consumed into final match settlement',
      jsonb_build_object('match_id', p_match_id)
    );

    IF v_player.team = p_winner_team THEN
      v_fee := CASE
        WHEN v_player.vip_active THEN 0
        ELSE ROUND(v_gross_per_winner * 0.1, 8)
      END;
      v_net := v_gross_per_winner - v_fee;
      v_total_fee := v_total_fee + v_fee;

      PERFORM public.wallet_apply_operation(
        v_player.user_id,
        v_net,
        0,
        'match_payout',
        'completed',
        p_match_id::TEXT || ':payout:' || v_player.user_id::TEXT,
        NULL,
        'match',
        p_match_id::TEXT,
        'Match payout credited',
        jsonb_build_object('gross', v_gross_per_winner, 'fee', v_fee, 'winner_team', p_winner_team)
      );

      UPDATE public.profiles
      SET wins = COALESCE(wins, 0) + 1,
          total_matches = COALESCE(total_matches, 0) + 1,
          total_earnings = COALESCE(total_earnings, 0) + v_net,
          total_volume = COALESCE(total_volume, 0) + COALESCE(v_match.wager_amount, 0),
          updated_at = NOW()
      WHERE id = v_player.user_id;
    ELSE
      UPDATE public.profiles
      SET losses = COALESCE(losses, 0) + 1,
          total_matches = COALESCE(total_matches, 0) + 1,
          total_volume = COALESCE(total_volume, 0) + COALESCE(v_match.wager_amount, 0),
          updated_at = NOW()
      WHERE id = v_player.user_id;
    END IF;
  END LOOP;

  UPDATE public.matches
  SET status = 'completed',
      phase = 'results',
      winner_team = p_winner_team,
      ended_at = NOW(),
      total_pool = COALESCE(v_match.wager_amount, 0) * v_player_count,
      platform_fee = v_total_fee,
      updated_at = NOW()
  WHERE id = p_match_id;

  INSERT INTO public.match_results (
    match_id,
    winner_team,
    metadata
  )
  VALUES (
    p_match_id,
    p_winner_team,
    COALESCE(p_metadata, '{}'::JSONB)
  )
  ON CONFLICT (match_id) DO UPDATE
  SET winner_team = EXCLUDED.winner_team,
      metadata = EXCLUDED.metadata,
      settled_at = NOW();

  INSERT INTO public.match_events (
    match_id,
    event_type,
    payload
  )
  VALUES (
    p_match_id,
    'match_finished',
    jsonb_build_object('winner_team', p_winner_team, 'platform_fee', v_total_fee)
  );

  PERFORM public.record_risk_event(
    NULL,
    p_match_id,
    'anti_cheat',
    'low',
    jsonb_build_object('hook', 'match_result_callback', 'winner_team', p_winner_team)
  );

  RETURN jsonb_build_object(
    'match_id', p_match_id,
    'winner_team', p_winner_team,
    'players', v_player_count,
    'gross_per_winner', v_gross_per_winner,
    'platform_fee', v_total_fee
  );
END;
$$;
