alter table public.profiles
  add column if not exists avatar_url text;

create or replace function public.sync_profile_from_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
  v_avatar_url text;
begin
  v_username := coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1));
  v_avatar_url := nullif(trim(coalesce(new.raw_user_meta_data ->> 'avatar_url', '')), '');

  insert into public.profiles (id, username, email, role, avatar_url)
  values (new.id, v_username, new.email, 'user', v_avatar_url)
  on conflict (id) do update
  set username = excluded.username,
      email = excluded.email,
      avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
      updated_at = now();

  insert into public.wallets (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

create or replace function public.get_public_profile_basics(
  p_user_ids uuid[]
)
returns table (
  id uuid,
  username text,
  email text,
  avatar_url text
)
language sql
security definer
set search_path = public
as $$
  select
    p.id,
    p.username,
    p.email,
    p.avatar_url
  from public.profiles p
  where p.id = any(coalesce(p_user_ids, array[]::uuid[]));
$$;

grant execute on function public.get_public_profile_basics(uuid[]) to authenticated;

create or replace function public.find_public_profile_by_username(
  p_username text
)
returns table (
  id uuid,
  username text,
  email text,
  avatar_url text
)
language sql
security definer
set search_path = public
as $$
  select
    p.id,
    p.username,
    p.email,
    p.avatar_url
  from public.profiles p
  where lower(trim(coalesce(p.username, ''))) = lower(trim(coalesce(p_username, '')))
  limit 1;
$$;

grant execute on function public.find_public_profile_by_username(text) to authenticated;
