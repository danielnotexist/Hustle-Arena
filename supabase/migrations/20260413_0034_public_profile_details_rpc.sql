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
  level integer
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
    p.level
  from public.profiles p
  where p.id = p_user_id
  limit 1;
$$;

grant execute on function public.get_public_profile_details(uuid) to authenticated;
