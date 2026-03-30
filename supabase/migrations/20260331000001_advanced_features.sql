-- 12. VIP & ADVANCED MATCHMAKING SCHEMA ADDITIONS

-- Add VIP columns to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_vip BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS vip_expires_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS total_winnings DECIMAL(20, 8) DEFAULT 0;

-- Create VIP Subscriptions log
CREATE TABLE IF NOT EXISTS public.vip_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan_type TEXT CHECK (plan_type IN ('monthly', 'yearly')),
  amount_paid DECIMAL(20, 8) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- Enhance Matches table for map voting & custom modes
ALTER TABLE public.matches 
ADD COLUMN IF NOT EXISTS game_mode TEXT DEFAULT 'competitive' CHECK (game_mode IN ('competitive', 'wingman', 'ffa', 'team_ffa')),
ADD COLUMN IF NOT EXISTS selected_map TEXT,
ADD COLUMN IF NOT EXISTS is_private BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS lobby_password TEXT,
ADD COLUMN IF NOT EXISTS total_pool DECIMAL(20, 8) DEFAULT 0,
ADD COLUMN IF NOT EXISTS platform_fee DECIMAL(20, 8) DEFAULT 0;

-- Table for Map Voting during Lobby phase
CREATE TABLE IF NOT EXISTS public.match_map_votes (
  match_id UUID REFERENCES public.matches(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  map_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (match_id, user_id)
);

-- Add 'is_ready' to match players
ALTER TABLE public.match_players
ADD COLUMN IF NOT EXISTS is_ready BOOLEAN DEFAULT FALSE;

-- Update RLS for new tables
ALTER TABLE public.vip_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_map_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can see own VIP subs" ON public.vip_subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Everyone can see map votes" ON public.match_map_votes FOR SELECT USING (true);
CREATE POLICY "Users can insert own map votes" ON public.match_map_votes FOR INSERT WITH CHECK (auth.uid() = user_id);
