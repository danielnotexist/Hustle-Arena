alter table public.profiles
  add column if not exists last_active_at timestamptz not null default now();

update public.profiles
set last_active_at = coalesce(last_active_at, updated_at, created_at, now())
where last_active_at is null;

drop function if exists public.get_public_profile_basics(uuid[]);

create or replace function public.get_public_profile_basics(
  p_user_ids uuid[]
)
returns table (
  id uuid,
  username text,
  email text,
  avatar_url text,
  last_active_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    p.id,
    p.username,
    p.email,
    p.avatar_url,
    p.last_active_at
  from public.profiles p
  where p.id = any(coalesce(p_user_ids, array[]::uuid[]));
$$;

grant execute on function public.get_public_profile_basics(uuid[]) to authenticated;

drop function if exists public.find_public_profile_by_username(text);

create or replace function public.find_public_profile_by_username(
  p_username text
)
returns table (
  id uuid,
  username text,
  email text,
  avatar_url text,
  last_active_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    p.id,
    p.username,
    p.email,
    p.avatar_url,
    p.last_active_at
  from public.profiles p
  where lower(trim(coalesce(p.username, ''))) = lower(trim(coalesce(p_username, '')))
  limit 1;
$$;

grant execute on function public.find_public_profile_by_username(text) to authenticated;

drop function if exists public.get_public_profile_details(uuid);

create or replace function public.get_public_profile_details(
  p_user_id uuid
)
returns table (
  id uuid,
  username text,
  email text,
  avatar_url text,
  cover_url text,
  bio text,
  country text,
  rank text,
  win_rate text,
  kd_ratio numeric,
  headshot_pct text,
  level integer,
  last_active_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    p.id,
    p.username,
    p.email,
    p.avatar_url,
    p.cover_url,
    p.bio,
    p.country,
    p.rank,
    p.win_rate,
    p.kd_ratio,
    p.headshot_pct,
    p.level,
    p.last_active_at
  from public.profiles p
  where p.id = p_user_id
  limit 1;
$$;

grant execute on function public.get_public_profile_details(uuid) to authenticated;
