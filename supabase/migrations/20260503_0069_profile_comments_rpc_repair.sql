-- 20260503_0069_profile_comments_rpc_repair.sql
-- Repair profile comment RPCs on environments where the table exists but the functions are missing.

create or replace function public.get_profile_comments(
  p_profile_user_id uuid,
  p_limit integer default 50
)
returns table (
  id bigint,
  profile_user_id uuid,
  author_user_id uuid,
  body text,
  created_at timestamptz,
  updated_at timestamptz,
  author_username text,
  author_avatar_url text
)
language sql
security definer
set search_path = public
as $$
  select
    c.id,
    c.profile_user_id,
    c.author_user_id,
    c.body,
    c.created_at,
    c.updated_at,
    p.username as author_username,
    p.avatar_url as author_avatar_url
  from public.profile_comments c
  join public.profiles p on p.id = c.author_user_id
  where c.profile_user_id = p_profile_user_id
  order by c.created_at desc, c.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

grant execute on function public.get_profile_comments(uuid, integer) to authenticated;

create or replace function public.add_profile_comment(
  p_profile_user_id uuid,
  p_body text
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_body text := btrim(coalesce(p_body, ''));
  v_comment_id bigint;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_profile_user_id is null then
    raise exception 'Profile is required';
  end if;

  if char_length(v_body) < 1 then
    raise exception 'Comment cannot be empty';
  end if;

  if char_length(v_body) > 500 then
    raise exception 'Comment must be 500 characters or fewer';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = p_profile_user_id
  ) then
    raise exception 'Profile not found';
  end if;

  insert into public.profile_comments (
    profile_user_id,
    author_user_id,
    body
  ) values (
    p_profile_user_id,
    v_user_id,
    v_body
  )
  returning id into v_comment_id;

  return v_comment_id;
end;
$$;

grant execute on function public.add_profile_comment(uuid, text) to authenticated;

create or replace function public.delete_profile_comment(
  p_comment_id bigint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  delete from public.profile_comments c
  where c.id = p_comment_id
    and (c.author_user_id = v_user_id or c.profile_user_id = v_user_id);

  if not found then
    raise exception 'Comment not found or permission denied';
  end if;
end;
$$;

grant execute on function public.delete_profile_comment(bigint) to authenticated;
