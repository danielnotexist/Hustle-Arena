-- 20260502_0066_steam_persona_display_names.sql
-- Steam persona names are display names. Do not append uniqueness suffixes.

alter table public.profiles
  drop constraint if exists profiles_username_key;

drop index if exists public.profiles_username_key;

update public.profiles
set username = regexp_replace(username, '_[0-9]{3,17}$', ''),
    updated_at = now()
where steam_verified = true
  and username ~ '_[0-9]{3,17}$';

update auth.users
set raw_user_meta_data = jsonb_set(
      coalesce(raw_user_meta_data, '{}'::jsonb),
      '{username}',
      to_jsonb(regexp_replace(raw_user_meta_data ->> 'username', '_[0-9]{3,17}$', '')),
      true
    )
where raw_user_meta_data ->> 'provider' = 'steam'
  and raw_user_meta_data ->> 'username' ~ '_[0-9]{3,17}$';
