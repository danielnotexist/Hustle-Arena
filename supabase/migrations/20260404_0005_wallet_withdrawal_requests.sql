-- 20260404_0005_wallet_withdrawal_requests.sql

do $$
begin
  if not exists (select 1 from pg_type where typname = 'ha_withdrawal_request_status') then
    create type public.ha_withdrawal_request_status as enum ('pending', 'approved', 'rejected');
  end if;
end $$;

create table if not exists public.withdrawal_requests (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount_usdt numeric(14,2) not null,
  network text not null default 'BEP20',
  destination_wallet_address text not null,
  note text,
  status public.ha_withdrawal_request_status not null default 'pending',
  admin_note text,
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  approved_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  constraint withdrawal_requests_amount_positive check (amount_usdt > 0)
);

create index if not exists idx_withdrawal_requests_user_requested on public.withdrawal_requests(user_id, requested_at desc);
create index if not exists idx_withdrawal_requests_status_requested on public.withdrawal_requests(status, requested_at desc);

alter table public.withdrawal_requests enable row level security;

drop policy if exists withdrawal_requests_select_self_or_admin on public.withdrawal_requests;
create policy withdrawal_requests_select_self_or_admin on public.withdrawal_requests
for select using (
  user_id = auth.uid()
  or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

drop policy if exists withdrawal_requests_insert_self on public.withdrawal_requests;
create policy withdrawal_requests_insert_self on public.withdrawal_requests
for insert with check (user_id = auth.uid() and status = 'pending');

drop policy if exists withdrawal_requests_admin_update on public.withdrawal_requests;
create policy withdrawal_requests_admin_update on public.withdrawal_requests
for update using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
)
with check (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

create or replace function public.admin_approve_withdrawal_request(
  p_request_id bigint,
  p_admin_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
  v_admin_role public.ha_role;
  v_request public.withdrawal_requests%rowtype;
  v_balance numeric(14,2);
begin
  select role into v_admin_role from public.profiles where id = v_admin_id;
  if v_admin_role is distinct from 'admin' then
    raise exception 'Only admins can approve withdrawal requests';
  end if;

  select * into v_request
  from public.withdrawal_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Withdrawal request not found';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'Withdrawal request is already processed';
  end if;

  update public.wallets
  set available_balance = available_balance - v_request.amount_usdt,
      updated_at = now()
  where user_id = v_request.user_id
    and available_balance >= v_request.amount_usdt
  returning available_balance into v_balance;

  if v_balance is null then
    raise exception 'Insufficient available balance for this withdrawal request';
  end if;

  insert into public.wallet_ledger (
    user_id,
    entry_type,
    amount,
    balance_after,
    note,
    reference_type,
    reference_id
  ) values (
    v_request.user_id,
    'withdrawal_approved',
    -v_request.amount_usdt,
    v_balance,
    coalesce(p_admin_note, 'Withdrawal approved by admin review'),
    'withdrawal_request',
    v_request.id::text
  );

  update public.withdrawal_requests
  set status = 'approved',
      admin_note = p_admin_note,
      reviewed_at = now(),
      approved_at = now(),
      reviewed_by = v_admin_id
  where id = p_request_id;

  perform public.create_notification(
    v_request.user_id,
    'withdrawal_approved',
    'Withdrawal approved',
    'Your USDT withdrawal request has been approved and queued for payout execution.',
    '/deposit',
    jsonb_build_object('withdrawal_request_id', v_request.id, 'amount_usdt', v_request.amount_usdt)
  );
end;
$$;

create or replace function public.admin_reject_withdrawal_request(
  p_request_id bigint,
  p_admin_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
  v_admin_role public.ha_role;
  v_request public.withdrawal_requests%rowtype;
begin
  select role into v_admin_role from public.profiles where id = v_admin_id;
  if v_admin_role is distinct from 'admin' then
    raise exception 'Only admins can reject withdrawal requests';
  end if;

  select * into v_request
  from public.withdrawal_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Withdrawal request not found';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'Withdrawal request is already processed';
  end if;

  update public.withdrawal_requests
  set status = 'rejected',
      admin_note = coalesce(p_admin_note, 'Withdrawal request rejected during admin review'),
      reviewed_at = now(),
      reviewed_by = v_admin_id
  where id = p_request_id;

  perform public.create_notification(
    v_request.user_id,
    'withdrawal_rejected',
    'Withdrawal review update',
    'Your USDT withdrawal request was rejected. Please review the admin note and try again if appropriate.',
    '/deposit',
    jsonb_build_object('withdrawal_request_id', v_request.id)
  );
end;
$$;
