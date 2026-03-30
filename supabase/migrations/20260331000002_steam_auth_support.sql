-- Add steam_id to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS steam_id TEXT UNIQUE;

-- Allow profiles to exist without a corresponding entry in auth.users 
-- (optional: remove the foreign key constraint if you want pure independence, 
-- but better to just make it optional or handle it via service role)

-- Since the current 'id' is 'UUID REFERENCES auth.users', it's strict.
-- Let's relax it for Steam users by allowing NULL in auth.users link 
-- or by just using a different ID generation.

-- Actually, a better approach is:
-- 1. Keep the 'id' as UUID.
-- 2. If it's a Steam user, we generate a UUID for them.
-- 3. We remove the hard 'REFERENCES auth.users' if we want to support non-Supabase-Auth users in the same table.

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
-- Optional: Re-add it as a weak reference if you want, but for simplicity we'll keep it as just a UUID.

-- Ensure wallet is created for steam users too
CREATE OR REPLACE FUNCTION public.handle_new_steam_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.wallets (user_id)
  VALUES (new.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_steam_user_created ON public.profiles;
CREATE TRIGGER on_steam_user_created
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  WHEN (NEW.steam_id IS NOT NULL)
  EXECUTE PROCEDURE public.handle_new_steam_user();
