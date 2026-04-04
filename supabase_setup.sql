-- Hustle Arena - Core platform schema for React migration
-- Safe to run on a fresh Supabase project.

create extension if not exists pgcrypto;

-- ===============
-- Core enums
-- ===============
do $$
begin
  if not exists (select 1 from pg_type where typname = 'ha_role') then
    create type public.ha_role as enum ('user','moderator','admin');
  end if;
  if not exists (select 1 from pg_type where typname = 'ha_mode') then
    create type public.ha_mode as enum ('demo','live');
  end if;
  if not exists (select 1 from pg_type where typname = 'ha_lobby_kind') then
    create type public.ha_lobby_kind as enum ('public','custom');
  end if;
  if not exists (select 1 from pg_type where typname = 'ha_team_side') then
    create type public.ha_team_side as enum ('T','CT','UNASSIGNED');
  end if;
  if not exists (select 1 from pg_type where typname = 'ha_lobby_status') then
    create type public.ha_lobby_status as enum ('open','in_progress','closed');
  end if;
  if not exists (select 1 from pg_type where typname = 'ha_match_status') then
    create type public.ha_match_status as enum ('pending','live','finished','interrupted','cancelled');
  end if;
  if not exists (select 1 from pg_type where typname = 'ha_invite_status') then
    create type public.ha_invite_status as enum ('pending','accepted','ignored','expired');
  end if;
  if not exists (select 1 from pg_type where typname = 'ha_friend_request_status') then
    create type public.ha_friend_request_status as enum ('pending','accepted','ignored','blocked');
  end if;
  if not exists (select 1 from pg_type where typname = 'ha_kyc_status') then
    create type public.ha_kyc_status as enum ('none','pending','verified','rejected');
  end if;
end $$;

-- ===============
-- Profiles + Wallet
-- ===============
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  email text not null unique,
  role public.ha_role not null default 'user',
  level integer not null default 1,
  kyc_status public.ha_kyc_status not null default 'none',
  is_banned boolean not null default false,
  suspended_until timestamptz,
  cooldown_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wallets (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  available_balance numeric(14,2) not null default 0,
  locked_balance numeric(14,2) not null default 0,
  demo_balance numeric(14,2) not null default 0,
  updated_at timestamptz not null default now(),
  constraint wallets_non_negative check (
    available_balance >= 0 and locked_balance >= 0 and demo_balance >= 0
  )
);

create table if not exists public.wallet_ledger (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  entry_type text not null,
  mode public.ha_mode,
  amount numeric(14,2) not null,
  balance_after numeric(14,2),
  note text,
  reference_type text,
  reference_id text,
  created_at timestamptz not null default now()
);
create index if not exists idx_wallet_ledger_user_created on public.wallet_ledger(user_id, created_at desc);

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

-- ===============
-- Social + Notifications
-- ===============
create table if not exists public.notifications (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  notice_type text not null,
  title text not null,
  body text not null,
  link_target text,
  metadata jsonb not null default '{}'::jsonb,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists idx_notifications_user_unread on public.notifications(user_id, is_read, created_at desc);

create table if not exists public.friend_requests (
  id bigserial primary key,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  target_id uuid not null references public.profiles(id) on delete cascade,
  status public.ha_friend_request_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(requester_id, target_id)
);

create table if not exists public.friends (
  user_id uuid not null references public.profiles(id) on delete cascade,
  friend_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  constraint friends_no_self check (user_id <> friend_id)
);

create table if not exists public.blocked_users (
  user_id uuid not null references public.profiles(id) on delete cascade,
  blocked_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, blocked_user_id),
  constraint blocked_no_self check (user_id <> blocked_user_id)
);

create table if not exists public.direct_messages (
  id bigserial primary key,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  message text,
  message_type text not null default 'text',
  metadata jsonb not null default '{}'::jsonb,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  constraint dm_not_self check (sender_id <> receiver_id)
);
create index if not exists idx_dm_receiver_unread on public.direct_messages(receiver_id, is_read, created_at desc);

-- ===============
-- Matchmaking + Lobby + Match
-- ===============
create table if not exists public.lobbies (
  id uuid primary key default gen_random_uuid(),
  mode public.ha_mode not null,
  kind public.ha_lobby_kind not null,
  name text not null,
  leader_id uuid not null references public.profiles(id) on delete cascade,
  status public.ha_lobby_status not null default 'open',
  stake_amount numeric(14,2) not null default 0,
  team_size integer not null default 5,
  max_players integer not null generated always as (team_size * 2) stored,
  game_mode text,
  password_hash text,
  selected_map text,
  map_voting_active boolean not null default false,
  join_server_deadline timestamptz,
  close_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lobbies_team_size_valid check (team_size in (1,2,5)),
  constraint lobbies_stake_nonnegative check (stake_amount >= 0)
);
create index if not exists idx_lobbies_status_mode on public.lobbies(status, mode, created_at desc);

create table if not exists public.lobby_members (
  lobby_id uuid not null references public.lobbies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  team_side public.ha_team_side not null default 'UNASSIGNED',
  is_ready boolean not null default false,
  joined_at timestamptz not null default now(),
  kicked_at timestamptz,
  left_at timestamptz,
  primary key(lobby_id, user_id)
);
create index if not exists idx_lobby_members_user on public.lobby_members(user_id, joined_at desc);

create table if not exists public.lobby_invites (
  id bigserial primary key,
  lobby_id uuid not null references public.lobbies(id) on delete cascade,
  from_user_id uuid not null references public.profiles(id) on delete cascade,
  to_user_id uuid not null references public.profiles(id) on delete cascade,
  status public.ha_invite_status not null default 'pending',
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique(lobby_id, to_user_id)
);

create table if not exists public.lobby_messages (
  id bigserial primary key,
  lobby_id uuid not null references public.lobbies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  message text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_lobby_messages_lobby_created on public.lobby_messages(lobby_id, created_at asc);

create table if not exists public.map_vote_sessions (
  id uuid primary key default gen_random_uuid(),
  lobby_id uuid not null unique references public.lobbies(id) on delete cascade,
  active_team public.ha_team_side not null,
  turn_ends_at timestamptz,
  turn_seconds integer not null default 15,
  remaining_maps text[] not null default array['dust2','inferno','mirage','vertigo','nuke','overpass','anubis','ancient'],
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.map_votes (
  session_id uuid not null references public.map_vote_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  map_code text not null,
  updated_at timestamptz not null default now(),
  primary key(session_id, user_id)
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  lobby_id uuid not null unique references public.lobbies(id) on delete cascade,
  mode public.ha_mode not null,
  status public.ha_match_status not null default 'pending',
  dedicated_server_id text,
  dedicated_server_endpoint text,
  started_at timestamptz,
  ended_at timestamptz,
  interrupted_at timestamptz,
  interruption_reason text,
  fee_percent numeric(5,2) not null default 10.0,
  created_at timestamptz not null default now(),
  constraint matches_fee_bounds check (fee_percent >= 0 and fee_percent <= 100)
);

create table if not exists public.match_players (
  match_id uuid not null references public.matches(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  team_side public.ha_team_side not null default 'UNASSIGNED',
  joined_server boolean not null default false,
  joined_server_at timestamptz,
  abandoned_at timestamptz,
  kills integer not null default 0,
  deaths integer not null default 0,
  assists integer not null default 0,
  round_score integer,
  payout_amount numeric(14,2) not null default 0,
  is_winner boolean,
  primary key(match_id, user_id)
);

create table if not exists public.match_events (
  id bigserial primary key,
  match_id uuid not null references public.matches(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_match_events_match on public.match_events(match_id, created_at desc);

create table if not exists public.penalties (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  penalty_type text not null,
  reason text not null,
  amount numeric(14,2) not null default 0,
  cooldown_until timestamptz,
  created_at timestamptz not null default now()
);

-- ===============
-- Triggers + Helpers
-- ===============
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.sync_profile_from_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
begin
  v_username := coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1));

  insert into public.profiles (id, username, email, role)
  values (new.id, v_username, new.email, 'user')
  on conflict (id) do update
  set username = excluded.username,
      email = excluded.email,
      updated_at = now();

  insert into public.wallets (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_sync_profile_from_auth_user on auth.users;
create trigger trg_sync_profile_from_auth_user
after insert or update on auth.users
for each row execute function public.sync_profile_from_auth_user();

drop trigger if exists trg_profiles_touch on public.profiles;
create trigger trg_profiles_touch
before update on public.profiles
for each row execute function public.touch_updated_at();

drop trigger if exists trg_lobbies_touch on public.lobbies;
create trigger trg_lobbies_touch
before update on public.lobbies
for each row execute function public.touch_updated_at();

drop trigger if exists trg_map_vote_sessions_touch on public.map_vote_sessions;
create trigger trg_map_vote_sessions_touch
before update on public.map_vote_sessions
for each row execute function public.touch_updated_at();

create or replace function public.create_notification(
  p_user_id uuid,
  p_notice_type text,
  p_title text,
  p_body text,
  p_link_target text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  insert into public.notifications (user_id, notice_type, title, body, link_target, metadata)
  values (p_user_id, p_notice_type, p_title, p_body, p_link_target, coalesce(p_metadata, '{}'::jsonb))
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.get_my_profile()
returns table (
  id uuid,
  username text,
  email text,
  role public.ha_role,
  level integer,
  kyc_status public.ha_kyc_status,
  is_banned boolean,
  suspended_until timestamptz,
  cooldown_until timestamptz,
  available_balance numeric,
  locked_balance numeric,
  demo_balance numeric
)
language sql
security definer
set search_path = public
as $$
  select p.id, p.username, p.email, p.role, p.level, p.kyc_status, p.is_banned, p.suspended_until, p.cooldown_until,
         coalesce(w.available_balance,0), coalesce(w.locked_balance,0), coalesce(w.demo_balance,0)
  from public.profiles p
  left join public.wallets w on w.user_id = p.id
  where p.id = auth.uid();
$$;

create or replace function public.mark_notification_read(p_notice_id bigint)
returns void
language sql
security definer
set search_path = public
as $$
  update public.notifications
  set is_read = true,
      read_at = now()
  where id = p_notice_id
    and user_id = auth.uid();
$$;

create or replace function public.admin_terminate_lobby(
  p_lobby_id uuid,
  p_reason text default 'Platform & ongoing Server maintenance'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
  v_admin_role public.ha_role;
  v_stake numeric(14,2);
  r_member record;
begin
  select role into v_admin_role from public.profiles where id = v_admin_id;
  if v_admin_role is distinct from 'admin' then
    raise exception 'Only admins can terminate lobbies';
  end if;

  select stake_amount into v_stake from public.lobbies where id = p_lobby_id;
  if v_stake is null then
    raise exception 'Lobby not found';
  end if;

  update public.lobbies
  set status = 'closed',
      close_reason = coalesce(p_reason, 'Platform & ongoing Server maintenance')
  where id = p_lobby_id;

  update public.matches
  set status = 'cancelled',
      interrupted_at = now(),
      interruption_reason = coalesce(p_reason, 'Platform & ongoing Server maintenance'),
      ended_at = now()
  where lobby_id = p_lobby_id
    and status in ('pending','live','interrupted');

  for r_member in
    select lm.user_id
    from public.lobby_members lm
    where lm.lobby_id = p_lobby_id
      and lm.kicked_at is null
      and lm.left_at is null
  loop
    update public.wallets
    set locked_balance = greatest(locked_balance - v_stake, 0),
        available_balance = available_balance + least(locked_balance, v_stake),
        updated_at = now()
    where user_id = r_member.user_id;

    insert into public.wallet_ledger(user_id, entry_type, amount, note, reference_type, reference_id)
    values (
      r_member.user_id,
      'admin_refund',
      coalesce(v_stake, 0),
      coalesce(p_reason, 'Platform & ongoing Server maintenance'),
      'lobby',
      p_lobby_id::text
    );

    perform public.create_notification(
      r_member.user_id,
      'admin_match_terminated',
      'Server closed by administration',
      'Server was closed by platform administration and all staked funds were restored. REASON: ' || coalesce(p_reason, 'Platform & ongoing Server maintenance'),
      '/matchmaking'
    );
  end loop;
end;
$$;

-- ===============
-- Reporting views (dashboard parity helpers)
-- ===============
create or replace view public.v_leaderboard_top as
select
  mp.user_id,
  p.username,
  sum(mp.payout_amount) as total_won_usdt
from public.match_players mp
join public.profiles p on p.id = mp.user_id
where mp.payout_amount > 0
group by mp.user_id, p.username
order by total_won_usdt desc, p.username asc;

create or replace view public.v_recent_matches as
select
  m.id as match_id,
  l.mode,
  l.kind,
  l.game_mode,
  coalesce(l.selected_map, '-') as map_name,
  l.stake_amount,
  m.status,
  m.started_at,
  m.ended_at
from public.matches m
join public.lobbies l on l.id = m.lobby_id
where m.status in ('finished','cancelled','interrupted')
order by coalesce(m.ended_at, m.started_at, m.created_at) desc;

create or replace view public.v_live_matches as
select
  l.id as lobby_id,
  l.name,
  l.mode,
  l.kind,
  l.stake_amount,
  l.team_size,
  l.game_mode,
  l.selected_map,
  l.status,
  (select count(*) from public.lobby_members lm where lm.lobby_id = l.id and lm.kicked_at is null and lm.left_at is null) as players_count,
  l.created_at
from public.lobbies l
where l.status in ('open','in_progress')
order by l.created_at desc;

-- ===============
-- RLS
-- ===============
alter table public.profiles enable row level security;
alter table public.wallets enable row level security;
alter table public.wallet_ledger enable row level security;
alter table public.deposit_requests enable row level security;
alter table public.withdrawal_requests enable row level security;
alter table public.notifications enable row level security;
alter table public.friend_requests enable row level security;
alter table public.friends enable row level security;
alter table public.blocked_users enable row level security;
alter table public.direct_messages enable row level security;
alter table public.lobbies enable row level security;
alter table public.lobby_members enable row level security;
alter table public.lobby_invites enable row level security;
alter table public.lobby_messages enable row level security;
alter table public.map_vote_sessions enable row level security;
alter table public.map_votes enable row level security;
alter table public.matches enable row level security;
alter table public.match_players enable row level security;
alter table public.match_events enable row level security;
alter table public.penalties enable row level security;

-- Profiles
 drop policy if exists profiles_select_self_or_admin on public.profiles;
create policy profiles_select_self_or_admin on public.profiles
for select using (id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

 drop policy if exists profiles_update_self_or_admin on public.profiles;
create policy profiles_update_self_or_admin on public.profiles
for update using (id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Wallet
 drop policy if exists wallets_select_self_or_admin on public.wallets;
create policy wallets_select_self_or_admin on public.wallets
for select using (user_id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

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

-- Notifications
 drop policy if exists notifications_select_self on public.notifications;
create policy notifications_select_self on public.notifications
for select using (user_id = auth.uid());

 drop policy if exists notifications_update_self on public.notifications;
create policy notifications_update_self on public.notifications
for update using (user_id = auth.uid());

-- Friends + Friend Requests + Blocks + DM
 drop policy if exists friend_requests_select_participant on public.friend_requests;
create policy friend_requests_select_participant on public.friend_requests
for select using (requester_id = auth.uid() or target_id = auth.uid());

 drop policy if exists friend_requests_insert_self on public.friend_requests;
create policy friend_requests_insert_self on public.friend_requests
for insert with check (requester_id = auth.uid());

 drop policy if exists friend_requests_update_participant on public.friend_requests;
create policy friend_requests_update_participant on public.friend_requests
for update using (requester_id = auth.uid() or target_id = auth.uid());

 drop policy if exists friends_select_participant on public.friends;
create policy friends_select_participant on public.friends
for select using (user_id = auth.uid() or friend_id = auth.uid());

 drop policy if exists blocked_users_select_owner on public.blocked_users;
create policy blocked_users_select_owner on public.blocked_users
for select using (user_id = auth.uid());

 drop policy if exists blocked_users_insert_owner on public.blocked_users;
create policy blocked_users_insert_owner on public.blocked_users
for insert with check (user_id = auth.uid());

 drop policy if exists blocked_users_delete_owner on public.blocked_users;
create policy blocked_users_delete_owner on public.blocked_users
for delete using (user_id = auth.uid());

 drop policy if exists dm_select_participant on public.direct_messages;
create policy dm_select_participant on public.direct_messages
for select using (sender_id = auth.uid() or receiver_id = auth.uid());

 drop policy if exists dm_insert_sender on public.direct_messages;
create policy dm_insert_sender on public.direct_messages
for insert with check (sender_id = auth.uid());

 drop policy if exists dm_update_receiver on public.direct_messages;
create policy dm_update_receiver on public.direct_messages
for update using (receiver_id = auth.uid());

-- Lobby domain
 drop policy if exists lobbies_select_all on public.lobbies;
create policy lobbies_select_all on public.lobbies
for select using (true);

 drop policy if exists lobbies_insert_leader on public.lobbies;
create policy lobbies_insert_leader on public.lobbies
for insert with check (leader_id = auth.uid());

 drop policy if exists lobbies_update_leader_or_admin on public.lobbies;
create policy lobbies_update_leader_or_admin on public.lobbies
for update using (
  leader_id = auth.uid()
  or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

 drop policy if exists lobby_members_select_all on public.lobby_members;
create policy lobby_members_select_all on public.lobby_members
for select using (true);

 drop policy if exists lobby_members_insert_self on public.lobby_members;
create policy lobby_members_insert_self on public.lobby_members
for insert with check (user_id = auth.uid());

 drop policy if exists lobby_members_update_self_or_leader_or_admin on public.lobby_members;
create policy lobby_members_update_self_or_leader_or_admin on public.lobby_members
for update using (
  user_id = auth.uid()
  or exists (select 1 from public.lobbies l where l.id = lobby_id and l.leader_id = auth.uid())
  or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

 drop policy if exists lobby_messages_select_all on public.lobby_messages;
create policy lobby_messages_select_all on public.lobby_messages
for select using (true);

 drop policy if exists lobby_messages_insert_member on public.lobby_messages;
create policy lobby_messages_insert_member on public.lobby_messages
for insert with check (
  user_id = auth.uid()
  and exists (select 1 from public.lobby_members lm where lm.lobby_id = lobby_id and lm.user_id = auth.uid() and lm.kicked_at is null and lm.left_at is null)
);

 drop policy if exists lobby_invites_select_participant on public.lobby_invites;
create policy lobby_invites_select_participant on public.lobby_invites
for select using (from_user_id = auth.uid() or to_user_id = auth.uid());

 drop policy if exists lobby_invites_insert_sender on public.lobby_invites;
create policy lobby_invites_insert_sender on public.lobby_invites
for insert with check (from_user_id = auth.uid());

 drop policy if exists lobby_invites_update_participant on public.lobby_invites;
create policy lobby_invites_update_participant on public.lobby_invites
for update using (from_user_id = auth.uid() or to_user_id = auth.uid());

-- Match views/events
 drop policy if exists matches_select_all on public.matches;
create policy matches_select_all on public.matches
for select using (true);

 drop policy if exists match_players_select_all on public.match_players;
create policy match_players_select_all on public.match_players
for select using (true);

 drop policy if exists match_players_update_self_or_admin on public.match_players;
create policy match_players_update_self_or_admin on public.match_players
for update using (
  user_id = auth.uid()
  or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

 drop policy if exists match_events_select_all on public.match_events;
create policy match_events_select_all on public.match_events
for select using (true);

-- Penalties (self read, admin full)
 drop policy if exists penalties_select_self_or_admin on public.penalties;
create policy penalties_select_self_or_admin on public.penalties
for select using (
  user_id = auth.uid()
  or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- Admin broad writes for moderation panels
 drop policy if exists admin_writes_notifications on public.notifications;
create policy admin_writes_notifications on public.notifications
for all
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

 drop policy if exists admin_writes_wallets on public.wallets;
create policy admin_writes_wallets on public.wallets
for all
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

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

 drop policy if exists admin_writes_lobbies on public.lobbies;
create policy admin_writes_lobbies on public.lobbies
for all
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));


alter table public.profiles add column if not exists bio text default 'Ready to dominate the arena. Tactical shooter veteran.';
alter table public.profiles add column if not exists country text default 'Israel';
alter table public.profiles add column if not exists twitter text default '';
alter table public.profiles add column if not exists twitch text default '';
alter table public.profiles add column if not exists kyc_message text;
alter table public.profiles add column if not exists kyc_updated_at timestamptz;
alter table public.profiles add column if not exists kyc_documents jsonb default '{}'::jsonb;
alter table public.profiles add column if not exists kyc_details jsonb default '{}'::jsonb;
alter table public.profiles add column if not exists rank text default 'Bronze I';
alter table public.profiles add column if not exists win_rate text default '0%';
alter table public.profiles add column if not exists kd_ratio numeric(10,2) default 0;
alter table public.profiles add column if not exists headshot_pct text default '0%';
alter table public.profiles add column if not exists performance jsonb default '[0,0,0,0,0,0,0,0,0,0]'::jsonb;

-- Squad Hub DM slice
create table if not exists public.friends (
  user_id uuid not null references public.profiles(id) on delete cascade,
  friend_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  constraint friends_no_self check (user_id <> friend_id)
);

create table if not exists public.direct_messages (
  id bigserial primary key,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  message text,
  message_type text not null default 'text',
  metadata jsonb not null default '{}'::jsonb,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  constraint dm_not_self check (sender_id <> receiver_id)
);

create index if not exists idx_dm_receiver_unread on public.direct_messages(receiver_id, is_read, created_at desc);

alter table public.friends enable row level security;
alter table public.direct_messages enable row level security;

drop policy if exists friends_select_participant on public.friends;
create policy friends_select_participant on public.friends
for select using (user_id = auth.uid() or friend_id = auth.uid());

drop policy if exists friends_insert_self on public.friends;
create policy friends_insert_self on public.friends
for insert with check (user_id = auth.uid());

drop policy if exists friends_delete_self on public.friends;
create policy friends_delete_self on public.friends
for delete using (user_id = auth.uid() or friend_id = auth.uid());

drop policy if exists dm_select_participant on public.direct_messages;
create policy dm_select_participant on public.direct_messages
for select using (sender_id = auth.uid() or receiver_id = auth.uid());

drop policy if exists dm_insert_sender on public.direct_messages;
create policy dm_insert_sender on public.direct_messages
for insert with check (sender_id = auth.uid());

drop policy if exists dm_update_receiver on public.direct_messages;
create policy dm_update_receiver on public.direct_messages
for update using (receiver_id = auth.uid());
-- 20260404_0003_friend_requests_and_dm_notifications.sql

-- This snapshot only adds the direct-message notification trigger here.
-- Core social tables and policies are already defined above.

create or replace function public.notify_direct_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  sender_name text;
  payload_text text;
begin
  select username into sender_name from public.profiles where id = new.sender_id;
  payload_text := coalesce(new.message, 'You have a new message.');

  insert into public.notifications (
    user_id,
    notice_type,
    title,
    body,
    link_target,
    metadata,
    is_read,
    created_at
  ) values (
    new.receiver_id,
    'direct_message',
    'New message',
    coalesce(sender_name, 'User') || ': ' || payload_text,
    '/squad-hub?friend=' || new.sender_id::text,
    jsonb_build_object(
      'sender_id', new.sender_id,
      'message_type', new.message_type
    ),
    false,
    now()
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_direct_message on public.direct_messages;
create trigger trg_notify_direct_message
after insert on public.direct_messages
for each row
execute function public.notify_direct_message();

