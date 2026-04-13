create or replace function public.find_public_profile_by_username(
  p_username text
)
returns table (
  id uuid,
  username text,
  email text
)
language sql
security definer
set search_path = public
as $$
  select
    p.id,
    p.username,
    p.email
  from public.profiles p
  where lower(trim(coalesce(p.username, ''))) = lower(trim(coalesce(p_username, '')))
  limit 1;
$$;

grant execute on function public.find_public_profile_by_username(text) to authenticated;
