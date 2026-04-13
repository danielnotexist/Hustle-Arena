create or replace function public.get_public_apex_leaderboard(
  p_limit integer default 10
)
returns table (
  user_id uuid,
  username text,
  avatar_url text,
  rank text,
  win_rate text,
  level integer,
  combat_rating numeric
)
language sql
security definer
set search_path = public
as $$
  select
    p.id as user_id,
    p.username,
    p.avatar_url,
    p.rank,
    p.win_rate,
    coalesce(p.level, 1) as level,
    coalesce(
      (
        coalesce(p.level, 1) * 100
      ) +
      (coalesce(nullif(replace(p.win_rate, '%', ''), ''), '0')::numeric * 10) +
      (coalesce(p.kd_ratio, 0) * 100),
      0
    ) as combat_rating
  from public.profiles p
  where coalesce(nullif(trim(p.username), ''), '') <> ''
  order by combat_rating desc, p.username asc
  limit greatest(coalesce(p_limit, 10), 1);
$$;

grant execute on function public.get_public_apex_leaderboard(integer) to authenticated;
