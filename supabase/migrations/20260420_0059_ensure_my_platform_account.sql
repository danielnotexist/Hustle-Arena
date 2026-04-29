-- 20260420_0059_ensure_my_platform_account.sql
-- Add an authenticated self-heal RPC for missing profile and wallet bootstrap rows.

create or replace function public.ensure_my_platform_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user auth.users%rowtype;
  v_username text;
begin
  select *
  into v_auth_user
  from auth.usersק
  where id = auth.uid();

  if not found then
    raise exception 'Authentication required';
  end if;

  v_username := coalesce(
    nullif(trim(v_auth_user.raw_user_meta_data ->> 'username'), ''),
    nullif(trim(split_part(coalesce(v_auth_user.email, ''), '@', 1)), ''),
    'player_' || left(replace(v_auth_user.id::text, '-', ''), 8)
  );

  insert into public.profiles (id, username, email, role)
  values (v_auth_user.id, v_username, v_auth_user.email, 'user')
  on conflict (id) do update
  set username = case
        when nullif(trim(public.profiles.username), '') is null then excluded.username
        else public.profiles.username
      end,
      email = case
        when nullif(trim(public.profiles.email), '') is null then excluded.email
        else public.profiles.email
      end,
      updated_at = now();

  insert into public.wallets (user_id)
  values (v_auth_user.id)
  on conflict (user_id) do nothing;
end;
$$;

grant execute on function public.ensure_my_platform_account() to authenticated;
