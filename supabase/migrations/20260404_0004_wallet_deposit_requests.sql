-- 20260404_0004_wallet_deposit_requests.sql

do $$
begin
  if not exists (select 1 from pg_type where typname = 'ha_deposit_request_status') then
    create type public.ha_deposit_request_status as enum ('pending', 'credited', 'rejected');
  end if;
end $$;

create table if not exists public.deposit_requests (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount_usdt numeric(14,2) not null,
  txid text not null unique,
  network text not null default 'BEP20',
  to_wallet_address text not null,
  from_wallet_address text,
  note text,
  status public.ha_deposit_request_status not null default 'pending',
  admin_note text,
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  credited_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  constraint deposit_requests_amount_positive check (amount_usdt > 0)
);

create index if not exists idx_deposit_requests_user_requested on public.deposit_requests(user_id, requested_at desc);
create index if not exists idx_deposit_requests_status_requested on public.deposit_requests(status, requested_at desc);

alter table public.deposit_requests enable row level security;

drop policy if exists deposit_requests_select_self_or_admin on public.deposit_requests;
create policy deposit_requests_select_self_or_admin on public.deposit_requests
for select using (
  user_id = auth.uid()
  or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

drop policy if exists deposit_requests_insert_self on public.deposit_requests;
create policy deposit_requests_insert_self on public.deposit_requests
for insert with check (user_id = auth.uid() and status = 'pending');

drop policy if exists deposit_requests_admin_update on public.deposit_requests;
create policy deposit_requests_admin_update on public.deposit_requests
for update using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
)
with check (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

create or replace function public.admin_approve_deposit_request(
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
  v_request public.deposit_requests%rowtype;
  v_balance numeric(14,2);
begin
  select role into v_admin_role from public.profiles where id = v_admin_id;
  if v_admin_role is distinct from 'admin' then
    raise exception 'Only admins can approve deposit requests';
  end if;

  select * into v_request
  from public.deposit_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Deposit request not found';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'Deposit request is already processed';
  end if;

  update public.wallets
  set available_balance = available_balance + v_request.amount_usdt,
      updated_at = now()
  where user_id = v_request.user_id
  returning available_balance into v_balance;

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
    'deposit_credit',
    v_request.amount_usdt,
    v_balance,
    coalesce(p_admin_note, 'Deposit credited by admin review'),
    'deposit_request',
    v_request.id::text
  );

  update public.deposit_requests
  set status = 'credited',
      admin_note = p_admin_note,
      reviewed_at = now(),
      credited_at = now(),
      reviewed_by = v_admin_id
  where id = p_request_id;

  perform public.create_notification(
    v_request.user_id,
    'deposit_credited',
    'Deposit credited',
    'Your USDT deposit request has been credited to your wallet.',
    '/deposit',
    jsonb_build_object('deposit_request_id', v_request.id, 'amount_usdt', v_request.amount_usdt)
  );
end;
$$;

create or replace function public.admin_reject_deposit_request(
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
  v_request public.deposit_requests%rowtype;
begin
  select role into v_admin_role from public.profiles where id = v_admin_id;
  if v_admin_role is distinct from 'admin' then
    raise exception 'Only admins can reject deposit requests';
  end if;

  select * into v_request
  from public.deposit_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Deposit request not found';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'Deposit request is already processed';
  end if;

  update public.deposit_requests
  set status = 'rejected',
      admin_note = coalesce(p_admin_note, 'Deposit request rejected during admin review'),
      reviewed_at = now(),
      reviewed_by = v_admin_id
  where id = p_request_id;

  perform public.create_notification(
    v_request.user_id,
    'deposit_rejected',
    'Deposit review update',
    'Your USDT deposit request was rejected. Please review the admin note and submit a corrected request if needed.',
    '/deposit',
    jsonb_build_object('deposit_request_id', v_request.id)
  );
end;
$$;
