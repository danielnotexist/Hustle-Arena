-- 20260404_0007_account_modes.sql

alter table public.profiles
  add column if not exists account_mode text not null default 'live';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_account_mode_check'
  ) then
    alter table public.profiles
      add constraint profiles_account_mode_check
      check (account_mode in ('live', 'demo'));
  end if;
end $$;

create or replace function public.admin_set_demo_balance(
  p_user_id uuid,
  p_amount numeric(14,2)
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
  v_admin_role public.ha_role;
begin
  select role into v_admin_role from public.profiles where id = v_admin_id;
  if v_admin_role is distinct from 'admin' then
    raise exception 'Only admins can set demo balances';
  end if;

  if p_amount < 0 then
    raise exception 'Demo balance must be non-negative';
  end if;

  update public.wallets
  set demo_balance = p_amount,
      updated_at = now()
  where user_id = p_user_id;

  perform public.create_treasury_audit_log(
    'demo_balance_set_by_admin',
    p_user_id,
    'wallet',
    p_user_id::text,
    jsonb_build_object('demo_balance', p_amount)
  );
end;
$$;
