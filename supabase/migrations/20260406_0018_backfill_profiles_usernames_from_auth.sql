-- 20260406_0018_backfill_profiles_usernames_from_auth.sql

insert into public.profiles (
  id,
  username,
  email,
  role
)
select
  au.id,
  coalesce(
    nullif(trim(au.raw_user_meta_data ->> 'username'), ''),
    nullif(trim(split_part(au.email, '@', 1)), ''),
    'player_' || left(replace(au.id::text, '-', ''), 8)
  ) as username,
  au.email,
  'user'::public.ha_role
from auth.users au
where au.email is not null
on conflict (id) do update
set username = coalesce(
      nullif(trim(public.profiles.username), ''),
      nullif(trim(excluded.username), ''),
      public.profiles.username
    ),
    email = coalesce(public.profiles.email, excluded.email),
    updated_at = now();

insert into public.wallets (user_id)
select p.id
from public.profiles p
left join public.wallets w on w.user_id = p.id
where w.user_id is null
on conflict (user_id) do nothing;
