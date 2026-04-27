-- 20260425_0062_cs2_server_control_and_telemetry_contract.sql
-- Provider-neutral CS2 server control and telemetry foundation.
-- The first provider can be a single GCP test VM, but the match lifecycle
-- remains isolated from provider-specific implementation details.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'ha_server_instance_status') then
    create type public.ha_server_instance_status as enum (
      'requested',
      'allocation_claimed',
      'provisioning',
      'booting',
      'ready',
      'live',
      'draining',
      'terminated',
      'failed'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'ha_match_lifecycle_job_type') then
    create type public.ha_match_lifecycle_job_type as enum (
      'allocate_server',
      'monitor_server',
      'teardown_server',
      'settle_match',
      'refund_interrupted_match'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'ha_match_lifecycle_job_status') then
    create type public.ha_match_lifecycle_job_status as enum (
      'queued',
      'claimed',
      'completed',
      'failed',
      'cancelled'
    );
  end if;
end $$;

alter table public.matches
  add column if not exists allocation_requested_at timestamptz;

alter table public.matches
  add column if not exists server_last_heartbeat_at timestamptz;

alter table public.matches
  add column if not exists server_failure_reason text;

create table if not exists public.server_instances (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null unique references public.matches(id) on delete cascade,
  game_key text not null default 'cs2',
  provider text not null,
  provider_region text,
  provider_instance_id text,
  status public.ha_server_instance_status not null default 'requested',
  endpoint text,
  public_ip text,
  connect_password_required boolean not null default false,
  worker_id text,
  claim_expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  requested_at timestamptz not null default now(),
  allocation_claimed_at timestamptz,
  provisioning_started_at timestamptz,
  booted_at timestamptz,
  ready_at timestamptz,
  live_at timestamptz,
  draining_at timestamptz,
  terminated_at timestamptz,
  failed_at timestamptz,
  last_heartbeat_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_server_instances_provider_instance
  on public.server_instances(provider, provider_instance_id)
  where provider_instance_id is not null;

create index if not exists idx_server_instances_status_updated
  on public.server_instances(status, updated_at desc);

create index if not exists idx_server_instances_match_status
  on public.server_instances(match_id, status);

create table if not exists public.match_server_telemetry_events (
  id bigserial primary key,
  match_id uuid not null references public.matches(id) on delete cascade,
  server_instance_id uuid references public.server_instances(id) on delete set null,
  event_id text,
  event_type text not null,
  source text not null default 'server-agent',
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  received_at timestamptz not null default now()
);

create unique index if not exists idx_match_server_telemetry_match_event_id
  on public.match_server_telemetry_events(match_id, event_id)
  where event_id is not null;

create index if not exists idx_match_server_telemetry_match_received
  on public.match_server_telemetry_events(match_id, received_at desc);

create index if not exists idx_match_server_telemetry_type_received
  on public.match_server_telemetry_events(event_type, received_at desc);

create table if not exists public.match_lifecycle_jobs (
  id bigserial primary key,
  match_id uuid not null references public.matches(id) on delete cascade,
  job_type public.ha_match_lifecycle_job_type not null,
  status public.ha_match_lifecycle_job_status not null default 'queued',
  idempotency_key text not null unique,
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  scheduled_at timestamptz not null default now(),
  claimed_by text,
  claim_expires_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  failure_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_match_lifecycle_jobs_claimable
  on public.match_lifecycle_jobs(job_type, status, scheduled_at, claim_expires_at);

create index if not exists idx_match_lifecycle_jobs_match
  on public.match_lifecycle_jobs(match_id, created_at desc);

create or replace function public.enqueue_cs2_server_allocation_from_match()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_provider text := coalesce(nullif(new.server_provider, ''), 'gcp-test');
begin
  if new.game_key = 'cs2'
    and new.status in ('pending', 'live')
    and coalesce(new.server_status, 'awaiting_allocation') in ('awaiting_allocation', 'pending-allocation')
  then
    insert into public.server_instances (
      match_id,
      game_key,
      provider,
      status,
      endpoint,
      connect_password_required,
      metadata
    ) values (
      new.id,
      'cs2',
      v_provider,
      'requested',
      new.dedicated_server_endpoint,
      coalesce((new.server_config ->> 'passwordRequired')::boolean, false),
      jsonb_build_object('bootstrap', new.server_config, 'queuedBy', 'match_trigger')
    )
    on conflict (match_id) do update
    set provider = coalesce(public.server_instances.provider, excluded.provider),
        endpoint = coalesce(public.server_instances.endpoint, excluded.endpoint),
        connect_password_required = excluded.connect_password_required,
        metadata = public.server_instances.metadata || excluded.metadata,
        status = case
          when public.server_instances.status in ('terminated', 'failed') then 'requested'::public.ha_server_instance_status
          else public.server_instances.status
        end,
        updated_at = now();

    insert into public.match_lifecycle_jobs (
      match_id,
      job_type,
      status,
      idempotency_key,
      metadata
    ) values (
      new.id,
      'allocate_server',
      'queued',
      'allocate_server:' || new.id::text,
      jsonb_build_object('provider', v_provider, 'queuedBy', 'match_trigger')
    )
    on conflict (idempotency_key) do update
    set status = case
          when public.match_lifecycle_jobs.status in ('completed', 'cancelled') then public.match_lifecycle_jobs.status
          else 'queued'::public.ha_match_lifecycle_job_status
        end,
        metadata = public.match_lifecycle_jobs.metadata || excluded.metadata,
        scheduled_at = now(),
        updated_at = now();

    update public.matches
    set allocation_requested_at = coalesce(allocation_requested_at, now()),
        server_status = case when server_status = 'pending-allocation' then 'awaiting_allocation' else server_status end
    where id = new.id
      and (allocation_requested_at is null or server_status = 'pending-allocation');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enqueue_cs2_server_allocation_from_match on public.matches;
create trigger trg_enqueue_cs2_server_allocation_from_match
after insert or update of status, server_status, server_config, dedicated_server_endpoint, game_key
on public.matches
for each row
execute function public.enqueue_cs2_server_allocation_from_match();

alter table public.server_instances enable row level security;
alter table public.match_server_telemetry_events enable row level security;
alter table public.match_lifecycle_jobs enable row level security;

drop policy if exists server_instances_admin_select on public.server_instances;
create policy server_instances_admin_select on public.server_instances
for select using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

drop policy if exists match_server_telemetry_admin_select on public.match_server_telemetry_events;
create policy match_server_telemetry_admin_select on public.match_server_telemetry_events
for select using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

drop policy if exists match_lifecycle_jobs_admin_select on public.match_lifecycle_jobs;
create policy match_lifecycle_jobs_admin_select on public.match_lifecycle_jobs
for select using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

create or replace function public.assert_service_role_or_admin()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_role public.ha_role;
begin
  if auth.role() = 'service_role' then
    return;
  end if;

  select role
  into v_actor_role
  from public.profiles
  where id = auth.uid();

  if v_actor_role is distinct from 'admin' then
    raise exception 'Only admins or service workers can perform this action';
  end if;
end;
$$;

create or replace function public.queue_match_server_allocation(
  p_match_id uuid,
  p_provider text default 'gcp-test',
  p_provider_region text default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.matches%rowtype;
  v_job_id bigint;
  v_provider text := lower(coalesce(nullif(trim(p_provider), ''), 'gcp-test'));
begin
  perform public.assert_service_role_or_admin();

  select *
  into v_match
  from public.matches
  where id = p_match_id
  for update;

  if not found then
    raise exception 'Match not found';
  end if;

  if v_match.game_key is distinct from 'cs2' then
    raise exception 'Only CS2 server allocation is supported by this contract';
  end if;

  if v_match.status not in ('pending', 'live') then
    raise exception 'Only pending or live matches can request server allocation';
  end if;

  insert into public.server_instances (
    match_id,
    game_key,
    provider,
    provider_region,
    status,
    endpoint,
    connect_password_required,
    metadata
  ) values (
    p_match_id,
    'cs2',
    v_provider,
    nullif(trim(coalesce(p_provider_region, '')), ''),
    'requested',
    v_match.dedicated_server_endpoint,
    coalesce((v_match.server_config ->> 'passwordRequired')::boolean, false),
    jsonb_build_object('bootstrap', v_match.server_config)
  )
  on conflict (match_id) do update
  set provider = excluded.provider,
      provider_region = coalesce(excluded.provider_region, public.server_instances.provider_region),
      status = case
        when public.server_instances.status in ('terminated', 'failed') then 'requested'::public.ha_server_instance_status
        else public.server_instances.status
      end,
      endpoint = coalesce(public.server_instances.endpoint, excluded.endpoint),
      connect_password_required = excluded.connect_password_required,
      metadata = public.server_instances.metadata || excluded.metadata,
      requested_at = coalesce(public.server_instances.requested_at, now()),
      updated_at = now();

  insert into public.match_lifecycle_jobs (
    match_id,
    job_type,
    status,
    idempotency_key,
    metadata
  ) values (
    p_match_id,
    'allocate_server',
    'queued',
    'allocate_server:' || p_match_id::text,
    jsonb_build_object('provider', v_provider, 'provider_region', p_provider_region)
  )
  on conflict (idempotency_key) do update
  set status = case
        when public.match_lifecycle_jobs.status in ('completed', 'cancelled') then public.match_lifecycle_jobs.status
        else 'queued'::public.ha_match_lifecycle_job_status
      end,
      scheduled_at = now(),
      metadata = public.match_lifecycle_jobs.metadata || excluded.metadata,
      updated_at = now()
  returning id into v_job_id;

  update public.matches
  set server_status = case
        when server_status in ('allocated', 'ready', 'live') then server_status
        else 'awaiting_allocation'
      end,
      allocation_requested_at = coalesce(allocation_requested_at, now())
  where id = p_match_id;

  return v_job_id;
end;
$$;

create or replace function public.claim_next_match_server_allocation(
  p_worker_id text,
  p_provider text default 'gcp-test',
  p_provider_region text default null,
  p_claim_seconds integer default 120
)
returns table (
  job_id bigint,
  match_id uuid,
  server_instance_id uuid,
  server_config jsonb,
  provider text,
  provider_region text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_worker_id text := nullif(trim(coalesce(p_worker_id, '')), '');
  v_provider text := lower(coalesce(nullif(trim(p_provider), ''), 'gcp-test'));
  v_region text := nullif(trim(coalesce(p_provider_region, '')), '');
  v_claim_seconds integer := least(greatest(coalesce(p_claim_seconds, 120), 30), 900);
  v_job public.match_lifecycle_jobs%rowtype;
  v_server public.server_instances%rowtype;
begin
  perform public.assert_service_role_or_admin();

  if v_worker_id is null then
    raise exception 'Worker id is required';
  end if;

  select *
  into v_job
  from public.match_lifecycle_jobs j
  where j.job_type = 'allocate_server'
    and j.status in ('queued', 'claimed', 'failed')
    and j.scheduled_at <= now()
    and (j.status <> 'claimed' or j.claim_expires_at is null or j.claim_expires_at < now())
    and j.attempts < j.max_attempts
  order by j.scheduled_at asc, j.id asc
  for update skip locked
  limit 1;

  if not found then
    return;
  end if;

  select *
  into v_server
  from public.server_instances si
  where si.match_id = v_job.match_id
  for update;

  if not found then
    perform public.queue_match_server_allocation(v_job.match_id, v_provider, v_region);
    select *
    into v_server
    from public.server_instances si
    where si.match_id = v_job.match_id
    for update;
  end if;

  update public.match_lifecycle_jobs
  set status = 'claimed',
      claimed_by = v_worker_id,
      claim_expires_at = now() + make_interval(secs => v_claim_seconds),
      attempts = attempts + 1,
      updated_at = now()
  where id = v_job.id
  returning * into v_job;

  update public.server_instances
  set status = 'allocation_claimed',
      provider = v_provider,
      provider_region = coalesce(v_region, provider_region),
      worker_id = v_worker_id,
      claim_expires_at = v_job.claim_expires_at,
      allocation_claimed_at = coalesce(allocation_claimed_at, now()),
      updated_at = now()
  where id = v_server.id
  returning * into v_server;

  update public.matches
  set server_status = 'allocation_claimed'
  where id = v_job.match_id;

  return query
  select
    v_job.id,
    v_job.match_id,
    v_server.id,
    coalesce(nullif(m.server_config, '{}'::jsonb), v_server.metadata -> 'bootstrap') as server_config,
    v_server.provider,
    v_server.provider_region
  from public.matches m
  where m.id = v_job.match_id;
end;
$$;

create or replace function public.record_match_server_status(
  p_match_id uuid,
  p_status public.ha_server_instance_status,
  p_provider_instance_id text default null,
  p_endpoint text default null,
  p_public_ip text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_failure_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_server_id uuid;
  v_now timestamptz := now();
  v_match_server_status text;
begin
  perform public.assert_service_role_or_admin();

  select id
  into v_server_id
  from public.server_instances
  where match_id = p_match_id
  for update;

  if v_server_id is null then
    raise exception 'Server instance not found for match';
  end if;

  update public.server_instances
  set status = p_status,
      provider_instance_id = coalesce(nullif(trim(coalesce(p_provider_instance_id, '')), ''), provider_instance_id),
      endpoint = coalesce(nullif(trim(coalesce(p_endpoint, '')), ''), endpoint),
      public_ip = coalesce(nullif(trim(coalesce(p_public_ip, '')), ''), public_ip),
      metadata = metadata || coalesce(p_metadata, '{}'::jsonb),
      provisioning_started_at = case when p_status = 'provisioning' then coalesce(provisioning_started_at, v_now) else provisioning_started_at end,
      booted_at = case when p_status = 'booting' then coalesce(booted_at, v_now) else booted_at end,
      ready_at = case when p_status = 'ready' then coalesce(ready_at, v_now) else ready_at end,
      live_at = case when p_status = 'live' then coalesce(live_at, v_now) else live_at end,
      draining_at = case when p_status = 'draining' then coalesce(draining_at, v_now) else draining_at end,
      terminated_at = case when p_status = 'terminated' then coalesce(terminated_at, v_now) else terminated_at end,
      failed_at = case when p_status = 'failed' then coalesce(failed_at, v_now) else failed_at end,
      failure_reason = case when p_status = 'failed' then coalesce(nullif(trim(coalesce(p_failure_reason, '')), ''), failure_reason) else failure_reason end,
      updated_at = v_now
  where id = v_server_id;

  v_match_server_status := case p_status
    when 'requested' then 'awaiting_allocation'
    when 'allocation_claimed' then 'allocation_claimed'
    when 'provisioning' then 'provisioning'
    when 'booting' then 'booting'
    when 'ready' then 'ready'
    when 'live' then 'live'
    when 'draining' then 'draining'
    when 'terminated' then 'terminated'
    when 'failed' then 'failed'
    else p_status::text
  end;

  update public.matches
  set dedicated_server_id = coalesce(nullif(trim(coalesce(p_provider_instance_id, '')), ''), dedicated_server_id),
      dedicated_server_endpoint = coalesce(nullif(trim(coalesce(p_endpoint, '')), ''), dedicated_server_endpoint),
      server_status = v_match_server_status,
      server_failure_reason = case when p_status = 'failed' then coalesce(nullif(trim(coalesce(p_failure_reason, '')), ''), server_failure_reason) else server_failure_reason end
  where id = p_match_id;

  if p_status in ('ready', 'live') then
    update public.match_lifecycle_jobs
    set status = 'completed',
        completed_at = v_now,
        updated_at = v_now
    where match_id = p_match_id
      and job_type = 'allocate_server'
      and status in ('queued', 'claimed', 'failed');
  elsif p_status = 'failed' then
    update public.match_lifecycle_jobs
    set status = case when attempts >= max_attempts then 'failed'::public.ha_match_lifecycle_job_status else 'queued'::public.ha_match_lifecycle_job_status end,
        failure_reason = coalesce(nullif(trim(coalesce(p_failure_reason, '')), ''), failure_reason),
        failed_at = case when attempts >= max_attempts then v_now else failed_at end,
        claim_expires_at = null,
        claimed_by = null,
        scheduled_at = case when attempts >= max_attempts then scheduled_at else v_now + interval '20 seconds' end,
        updated_at = v_now
    where match_id = p_match_id
      and job_type = 'allocate_server'
      and status in ('queued', 'claimed');
  end if;

  return v_server_id;
end;
$$;

create or replace function public.record_match_server_heartbeat(
  p_match_id uuid,
  p_provider_instance_id text default null,
  p_status public.ha_server_instance_status default null,
  p_payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.ha_server_instance_status;
begin
  perform public.assert_service_role_or_admin();

  select coalesce(p_status, status)
  into v_status
  from public.server_instances
  where match_id = p_match_id;

  if v_status is null then
    raise exception 'Server instance not found for match';
  end if;

  update public.server_instances
  set provider_instance_id = coalesce(nullif(trim(coalesce(p_provider_instance_id, '')), ''), provider_instance_id),
      status = v_status,
      last_heartbeat_at = now(),
      metadata = metadata || jsonb_build_object('lastHeartbeat', coalesce(p_payload, '{}'::jsonb)),
      updated_at = now()
  where match_id = p_match_id;

  update public.matches
  set server_last_heartbeat_at = now(),
      server_status = case when v_status = 'live' then 'live' else server_status end
  where id = p_match_id;
end;
$$;

create or replace function public.record_match_server_telemetry(
  p_match_id uuid,
  p_event_type text,
  p_payload jsonb default '{}'::jsonb,
  p_event_id text default null,
  p_occurred_at timestamptz default null,
  p_source text default 'server-agent'
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_server_id uuid;
  v_event_id text := nullif(trim(coalesce(p_event_id, '')), '');
  v_event_type text := lower(nullif(trim(coalesce(p_event_type, '')), ''));
  v_row_id bigint;
begin
  perform public.assert_service_role_or_admin();

  if v_event_type is null then
    raise exception 'Telemetry event type is required';
  end if;

  select id
  into v_server_id
  from public.server_instances
  where match_id = p_match_id;

  insert into public.match_server_telemetry_events (
    match_id,
    server_instance_id,
    event_id,
    event_type,
    source,
    payload,
    occurred_at
  ) values (
    p_match_id,
    v_server_id,
    v_event_id,
    v_event_type,
    coalesce(nullif(trim(p_source), ''), 'server-agent'),
    coalesce(p_payload, '{}'::jsonb),
    coalesce(p_occurred_at, now())
  )
  on conflict (match_id, event_id) where event_id is not null do update
  set payload = public.match_server_telemetry_events.payload || excluded.payload,
      received_at = now()
  returning id into v_row_id;

  if v_event_type = 'heartbeat' then
    perform public.record_match_server_heartbeat(p_match_id, null, null, p_payload);
  elsif v_event_type in ('server_ready', 'ready') then
    perform public.record_match_server_status(p_match_id, 'ready', null, null, null, p_payload, null);
  elsif v_event_type in ('match_live', 'live') then
    perform public.record_match_server_status(p_match_id, 'live', null, null, null, p_payload, null);
  elsif v_event_type in ('match_end', 'match_finished') then
    insert into public.match_lifecycle_jobs (
      match_id,
      job_type,
      status,
      idempotency_key,
      metadata
    ) values (
      p_match_id,
      'settle_match',
      'queued',
      'settle_match:' || p_match_id::text,
      jsonb_build_object('source_event_id', v_event_id, 'payload', coalesce(p_payload, '{}'::jsonb))
    )
    on conflict (idempotency_key) do update
    set metadata = public.match_lifecycle_jobs.metadata || excluded.metadata,
        scheduled_at = now(),
        status = case
          when public.match_lifecycle_jobs.status = 'completed' then 'completed'::public.ha_match_lifecycle_job_status
          else 'queued'::public.ha_match_lifecycle_job_status
        end,
        updated_at = now();
  elsif v_event_type in ('server_crashed', 'crash') then
    perform public.record_match_server_status(p_match_id, 'failed', null, null, null, p_payload, coalesce(p_payload ->> 'reason', 'Server crash reported by telemetry'));

    insert into public.match_lifecycle_jobs (
      match_id,
      job_type,
      status,
      idempotency_key,
      metadata
    ) values (
      p_match_id,
      'refund_interrupted_match',
      'queued',
      'refund_interrupted_match:' || p_match_id::text,
      jsonb_build_object('source_event_id', v_event_id, 'reason', coalesce(p_payload ->> 'reason', 'server_crashed'))
    )
    on conflict (idempotency_key) do nothing;
  end if;

  return v_row_id;
end;
$$;

create or replace function public.queue_match_server_teardown(
  p_match_id uuid,
  p_reason text default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job_id bigint;
begin
  perform public.assert_service_role_or_admin();

  insert into public.match_lifecycle_jobs (
    match_id,
    job_type,
    status,
    idempotency_key,
    metadata
  ) values (
    p_match_id,
    'teardown_server',
    'queued',
    'teardown_server:' || p_match_id::text,
    jsonb_build_object('reason', p_reason)
  )
  on conflict (idempotency_key) do update
  set status = case
        when public.match_lifecycle_jobs.status = 'completed' then 'completed'::public.ha_match_lifecycle_job_status
        else 'queued'::public.ha_match_lifecycle_job_status
      end,
      metadata = public.match_lifecycle_jobs.metadata || excluded.metadata,
      scheduled_at = now(),
      updated_at = now()
  returning id into v_job_id;

  update public.server_instances
  set status = case when status in ('terminated', 'failed') then status else 'draining'::public.ha_server_instance_status end,
      draining_at = coalesce(draining_at, now()),
      updated_at = now()
  where match_id = p_match_id;

  update public.matches
  set server_status = case when server_status in ('terminated', 'failed') then server_status else 'draining' end
  where id = p_match_id;

  return v_job_id;
end;
$$;

revoke all on function public.assert_service_role_or_admin() from public;
revoke all on function public.queue_match_server_allocation(uuid, text, text) from public;
revoke all on function public.claim_next_match_server_allocation(text, text, text, integer) from public;
revoke all on function public.record_match_server_status(uuid, public.ha_server_instance_status, text, text, text, jsonb, text) from public;
revoke all on function public.record_match_server_heartbeat(uuid, text, public.ha_server_instance_status, jsonb) from public;
revoke all on function public.record_match_server_telemetry(uuid, text, jsonb, text, timestamptz, text) from public;
revoke all on function public.queue_match_server_teardown(uuid, text) from public;

grant execute on function public.queue_match_server_allocation(uuid, text, text) to authenticated;
grant execute on function public.claim_next_match_server_allocation(text, text, text, integer) to authenticated;
grant execute on function public.record_match_server_status(uuid, public.ha_server_instance_status, text, text, text, jsonb, text) to authenticated;
grant execute on function public.record_match_server_heartbeat(uuid, text, public.ha_server_instance_status, jsonb) to authenticated;
grant execute on function public.record_match_server_telemetry(uuid, text, jsonb, text, timestamptz, text) to authenticated;
grant execute on function public.queue_match_server_teardown(uuid, text) to authenticated;

grant execute on function public.queue_match_server_allocation(uuid, text, text) to service_role;
grant execute on function public.claim_next_match_server_allocation(text, text, text, integer) to service_role;
grant execute on function public.record_match_server_status(uuid, public.ha_server_instance_status, text, text, text, jsonb, text) to service_role;
grant execute on function public.record_match_server_heartbeat(uuid, text, public.ha_server_instance_status, jsonb) to service_role;
grant execute on function public.record_match_server_telemetry(uuid, text, jsonb, text, timestamptz, text) to service_role;
grant execute on function public.queue_match_server_teardown(uuid, text) to service_role;
