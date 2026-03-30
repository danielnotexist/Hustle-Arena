-- Update handle_new_user to be more robust
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  username_val TEXT;
BEGIN
  -- Try to get username from metadata, fallback to email prefix if not present
  username_val := COALESCE(
    new.raw_user_meta_data->>'username',
    split_part(new.email, '@', 1),
    'user_' || substr(new.id::text, 1, 8)
  );

  INSERT INTO public.profiles (id, username, avatar_url)
  VALUES (new.id, username_val, new.raw_user_meta_data->>'avatar_url')
  ON CONFLICT (id) DO UPDATE SET
    username = EXCLUDED.username,
    avatar_url = EXCLUDED.avatar_url;

  INSERT INTO public.wallets (user_id)
  VALUES (new.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
