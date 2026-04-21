-- 20260421_0059_remove_codex_test_accounts.sql
-- Remove CODEX test accounts and all dependent records that can keep
-- demo users stuck in queue, ready-check, social, or lobby tables.

do $$
declare
  v_codex_user_ids uuid[] := '{}'::uuid[];
  v_deleted_auth_users integer := 0;
  v_deleted_profiles integer := 0;
begin
  select coalesce(array_agg(p.id), '{}'::uuid[])
  into v_codex_user_ids
  from public.profiles p
  where lower(trim(coalesce(p.username, ''))) like 'codex%';

  if coalesce(array_length(v_codex_user_ids, 1), 0) = 0 then
    raise notice 'No CODEX test accounts were found.';
    return;
  end if;

  delete from auth.identities
  where user_id = any(v_codex_user_ids);

  delete from auth.users
  where id = any(v_codex_user_ids);

  get diagnostics v_deleted_auth_users = row_count;

  -- Fallback cleanup in case any profile row exists without a linked auth user.
  delete from public.profiles
  where id = any(v_codex_user_ids);

  get diagnostics v_deleted_profiles = row_count;

  raise notice 'Deleted % CODEX auth users and % remaining profiles.',
    v_deleted_auth_users,
    v_deleted_profiles;
end;
$$;
