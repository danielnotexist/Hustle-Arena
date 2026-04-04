-- 20260404_0006_treasury_payout_jobs.sql

do $$
begin
  if not exists (select 1 from pg_type where typname = 'ha_payout_job_status') then
    create type public.ha_payout_job_status as enum ('queued', 'broadcasted', 'confirmed', 'failed', 'cancelled');
  end if;
end $$;

create table if not exists public.payout_jobs (
  id bigserial primary key,
  withdrawal_request_id bigint not null unique references public.withdrawal_requests(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount_usdt numeric(14,2) not null,
  network text not null default 'BEP20',
  destination_wallet_address text not null,
  status public.ha_payout_job_status not null default 'queued',
  txid text,
  failure_reason text,
  admin_note text,
  queued_at timestamptz not null default now(),
  broadcasted_at timestamptz,
  confirmed_at timestamptz,
  failed_at timestamptz,
  cancelled_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  constraint payout_jobs_amount_positive check (amount_usdt > 0)
);

create index if not exists idx_payout_jobs_status_queued on public.payout_jobs(status, queued_at desc);
create index if not exists idx_payout_jobs_user_queued on public.payout_jobs(user_id, queued_at desc);

create table if not exists public.treasury_audit_log (
  id bigserial primary key,
  action_type text not null,
  actor_user_id uuid references public.profiles(id) on delete set null,
  subject_user_id uuid references public.profiles(id) on delete set null,
  reference_type text not null,
  reference_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_treasury_audit_log_created on public.treasury_audit_log(created_at desc);
create index if not exists idx_treasury_audit_log_subject_created on public.treasury_audit_log(subject_user_id, created_at desc);

alter table public.payout_jobs enable row level security;
alter table public.treasury_audit_log enable row level security;

drop policy if exists payout_jobs_select_self_or_admin on public.payout_jobs;
create policy payout_jobs_select_self_or_admin on public.payout_jobs
for select using (
  user_id = auth.uid()
  or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

drop policy if exists payout_jobs_admin_insert on public.payout_jobs;
create policy payout_jobs_admin_insert on public.payout_jobs
for insert with check (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

drop policy if exists payout_jobs_admin_update on public.payout_jobs;
create policy payout_jobs_admin_update on public.payout_jobs
for update using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
)
with check (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

drop policy if exists treasury_audit_log_admin_select on public.treasury_audit_log;
create policy treasury_audit_log_admin_select on public.treasury_audit_log
for select using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

drop policy if exists treasury_audit_log_admin_insert on public.treasury_audit_log;
create policy treasury_audit_log_admin_insert on public.treasury_audit_log
for insert with check (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

create or replace function public.create_treasury_audit_log(
  p_action_type text,
  p_subject_user_id uuid,
  p_reference_type text,
  p_reference_id text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.treasury_audit_log (
    action_type,
    actor_user_id,
    subject_user_id,
    reference_type,
    reference_id,
    metadata
  ) values (
    p_action_type,
    auth.uid(),
    p_subject_user_id,
    p_reference_type,
    p_reference_id,
    coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

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

  insert into public.payout_jobs (
    withdrawal_request_id,
    user_id,
    amount_usdt,
    network,
    destination_wallet_address,
    status,
    admin_note,
    created_by,
    updated_by
  ) values (
    v_request.id,
    v_request.user_id,
    v_request.amount_usdt,
    v_request.network,
    v_request.destination_wallet_address,
    'queued',
    p_admin_note,
    v_admin_id,
    v_admin_id
  )
  on conflict (withdrawal_request_id) do nothing;

  perform public.create_treasury_audit_log(
    'withdrawal_request_approved',
    v_request.user_id,
    'withdrawal_request',
    v_request.id::text,
    jsonb_build_object('amount_usdt', v_request.amount_usdt, 'network', v_request.network)
  );

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

create or replace function public.admin_mark_payout_broadcasted(
  p_payout_job_id bigint,
  p_txid text,
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
  v_job public.payout_jobs%rowtype;
begin
  select role into v_admin_role from public.profiles where id = v_admin_id;
  if v_admin_role is distinct from 'admin' then
    raise exception 'Only admins can update payout jobs';
  end if;

  if coalesce(nullif(trim(p_txid), ''), '') = '' then
    raise exception 'Payout TXID is required when marking a payout as broadcasted';
  end if;

  select * into v_job
  from public.payout_jobs
  where id = p_payout_job_id
  for update;

  if not found then
    raise exception 'Payout job not found';
  end if;

  if v_job.status <> 'queued' then
    raise exception 'Only queued payout jobs can be marked as broadcasted';
  end if;

  update public.payout_jobs
  set status = 'broadcasted',
      txid = trim(lower(p_txid)),
      admin_note = coalesce(p_admin_note, admin_note),
      broadcasted_at = now(),
      updated_by = v_admin_id
  where id = p_payout_job_id;

  perform public.create_treasury_audit_log(
    'payout_broadcasted',
    v_job.user_id,
    'payout_job',
    v_job.id::text,
    jsonb_build_object('withdrawal_request_id', v_job.withdrawal_request_id, 'txid', trim(lower(p_txid)))
  );

  perform public.create_notification(
    v_job.user_id,
    'withdrawal_processing',
    'Withdrawal processing',
    'Your USDT withdrawal has been broadcast to the network and is awaiting confirmation.',
    '/deposit',
    jsonb_build_object('payout_job_id', v_job.id, 'txid', trim(lower(p_txid)))
  );
end;
$$;

create or replace function public.admin_mark_payout_confirmed(
  p_payout_job_id bigint,
  p_txid text default null,
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
  v_job public.payout_jobs%rowtype;
  v_effective_txid text;
begin
  select role into v_admin_role from public.profiles where id = v_admin_id;
  if v_admin_role is distinct from 'admin' then
    raise exception 'Only admins can update payout jobs';
  end if;

  select * into v_job
  from public.payout_jobs
  where id = p_payout_job_id
  for update;

  if not found then
    raise exception 'Payout job not found';
  end if;

  if v_job.status not in ('queued', 'broadcasted') then
    raise exception 'Only queued or broadcasted payout jobs can be confirmed';
  end if;

  v_effective_txid := coalesce(nullif(trim(p_txid), ''), v_job.txid);

  update public.payout_jobs
  set status = 'confirmed',
      txid = v_effective_txid,
      admin_note = coalesce(p_admin_note, admin_note),
      confirmed_at = now(),
      updated_by = v_admin_id
  where id = p_payout_job_id;

  perform public.create_treasury_audit_log(
    'payout_confirmed',
    v_job.user_id,
    'payout_job',
    v_job.id::text,
    jsonb_build_object('withdrawal_request_id', v_job.withdrawal_request_id, 'txid', v_effective_txid)
  );

  perform public.create_notification(
    v_job.user_id,
    'withdrawal_completed',
    'Withdrawal sent',
    'Your USDT withdrawal was completed successfully.',
    '/deposit',
    jsonb_build_object('payout_job_id', v_job.id, 'txid', v_effective_txid)
  );
end;
$$;

create or replace function public.admin_mark_payout_failed(
  p_payout_job_id bigint,
  p_failure_reason text,
  p_admin_note text default null,
  p_refund_to_available boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
  v_admin_role public.ha_role;
  v_job public.payout_jobs%rowtype;
  v_balance numeric(14,2);
begin
  select role into v_admin_role from public.profiles where id = v_admin_id;
  if v_admin_role is distinct from 'admin' then
    raise exception 'Only admins can update payout jobs';
  end if;

  if coalesce(nullif(trim(p_failure_reason), ''), '') = '' then
    raise exception 'A failure reason is required';
  end if;

  select * into v_job
  from public.payout_jobs
  where id = p_payout_job_id
  for update;

  if not found then
    raise exception 'Payout job not found';
  end if;

  if v_job.status not in ('queued', 'broadcasted') then
    raise exception 'Only queued or broadcasted payout jobs can be failed';
  end if;

  update public.payout_jobs
  set status = 'failed',
      failure_reason = trim(p_failure_reason),
      admin_note = coalesce(p_admin_note, admin_note),
      failed_at = now(),
      updated_by = v_admin_id
  where id = p_payout_job_id;

  if p_refund_to_available then
    update public.wallets
    set available_balance = available_balance + v_job.amount_usdt,
        updated_at = now()
    where user_id = v_job.user_id
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
      v_job.user_id,
      'withdrawal_failed_refund',
      v_job.amount_usdt,
      v_balance,
      coalesce(p_admin_note, trim(p_failure_reason)),
      'payout_job',
      v_job.id::text
    );
  end if;

  perform public.create_treasury_audit_log(
    'payout_failed',
    v_job.user_id,
    'payout_job',
    v_job.id::text,
    jsonb_build_object(
      'withdrawal_request_id', v_job.withdrawal_request_id,
      'failure_reason', trim(p_failure_reason),
      'refund_to_available', p_refund_to_available
    )
  );

  perform public.create_notification(
    v_job.user_id,
    'withdrawal_failed',
    'Withdrawal payout failed',
    case
      when p_refund_to_available then 'Your USDT withdrawal payout failed and the amount was returned to your available balance.'
      else 'Your USDT withdrawal payout failed and is awaiting manual treasury handling.'
    end,
    '/deposit',
    jsonb_build_object(
      'payout_job_id', v_job.id,
      'failure_reason', trim(p_failure_reason),
      'refund_to_available', p_refund_to_available
    )
  );
end;
$$;
