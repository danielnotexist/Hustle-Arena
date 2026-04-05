-- 20260405_0011_self_demo_balance_rpc.sql

create or replace function public.set_my_demo_balance(
  p_amount numeric(14,2)
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

  if p_amount < 0 then
    raise exception 'Demo balance must be non-negative';
  end if;

  update public.wallets
  set demo_balance = p_amount,
      updated_at = now()
  where user_id = v_user_id;

  if not found then
    raise exception 'Wallet not found for the current user';
  end if;

  perform public.create_treasury_audit_log(
    'demo_balance_set_by_user',
    v_user_id,
    'wallet',
    v_user_id::text,
    jsonb_build_object('demo_balance', p_amount)
  );
end;
$$;
