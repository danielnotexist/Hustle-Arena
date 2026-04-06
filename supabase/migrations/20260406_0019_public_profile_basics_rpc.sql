-- 20260406_0019_public_profile_basics_rpc.sql

create or replace function public.get_public_profile_basics(
  p_user_ids uuid[]
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
  where p.id = any(coalesce(p_user_ids, array[]::uuid[]));
$$;

grant execute on function public.get_public_profile_basics(uuid[]) to authenticated;
