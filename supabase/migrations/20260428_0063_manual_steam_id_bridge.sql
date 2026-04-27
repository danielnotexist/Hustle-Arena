-- 20260428_0063_manual_steam_id_bridge.sql
-- Temporary Steam identity bridge for CS2 tests.
-- Manual SteamID64 values are enough for demo/server matching, but live-stake
-- settlement must require steam_verified=true once Steam OpenID is implemented.

alter table public.profiles
  add column if not exists steam_id64 text,
  add column if not exists steam_verified boolean not null default false,
  add column if not exists steam_linked_at timestamptz,
  add column if not exists steam_last_verified_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_steam_id64_format'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_steam_id64_format
      check (steam_id64 is null or steam_id64 ~ '^[0-9]{17}$')
      not valid;
  end if;
end $$;

alter table public.profiles validate constraint profiles_steam_id64_format;

create unique index if not exists idx_profiles_steam_id64_unique
  on public.profiles(steam_id64)
  where steam_id64 is not null;

alter table public.match_players
  add column if not exists steam_id64 text,
  add column if not exists steam_verified boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'match_players_steam_id64_format'
      and conrelid = 'public.match_players'::regclass
  ) then
    alter table public.match_players
      add constraint match_players_steam_id64_format
      check (steam_id64 is null or steam_id64 ~ '^[0-9]{17}$')
      not valid;
  end if;
end $$;

alter table public.match_players validate constraint match_players_steam_id64_format;

create index if not exists idx_match_players_steam_id64
  on public.match_players(match_id, steam_id64)
  where steam_id64 is not null;

create or replace function public.normalize_steam_id64(p_steam_id64 text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(coalesce(p_steam_id64, ''), '\s+', '', 'g'), '');
$$;

create or replace function public.update_my_steam_id64(p_steam_id64 text)
returns table (
  steam_id64 text,
  steam_verified boolean,
  steam_linked_at timestamptz,
  steam_last_verified_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_steam_id64 text := public.normalize_steam_id64(p_steam_id64);
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if v_steam_id64 is null or v_steam_id64 !~ '^[0-9]{17}$' then
    raise exception 'Enter a valid 17-digit SteamID64';
  end if;

  if exists (
    select 1
    from public.profiles p
    where p.steam_id64 = v_steam_id64
      and p.id <> v_user_id
  ) then
    raise exception 'This SteamID64 is already linked to another Hustle Arena account';
  end if;

  if exists (
    select 1
    from public.match_players mp
    join public.matches m on m.id = mp.match_id
    where mp.user_id = v_user_id
      and m.status in ('pending', 'live')
  ) then
    raise exception 'You cannot change SteamID64 while assigned to an active match';
  end if;

  update public.profiles p
  set steam_id64 = v_steam_id64,
      steam_verified = case when p.steam_id64 = v_steam_id64 then p.steam_verified else false end,
      steam_linked_at = coalesce(p.steam_linked_at, now()),
      steam_last_verified_at = case when p.steam_id64 = v_steam_id64 then p.steam_last_verified_at else null end,
      updated_at = now()
  where p.id = v_user_id;

  return query
  select p.steam_id64, p.steam_verified, p.steam_linked_at, p.steam_last_verified_at
  from public.profiles p
  where p.id = v_user_id;
end;
$$;

create or replace function public.assert_user_has_cs2_identity(
  p_user_id uuid,
  p_mode public.ha_mode,
  p_stake_amount numeric default 0
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
begin
  select *
  into v_profile
  from public.profiles
  where id = p_user_id;

  if not found then
    raise exception 'Player profile not found';
  end if;

  if nullif(trim(coalesce(v_profile.steam_id64, '')), '') is null then
    raise exception 'Connect your SteamID64 in Profile settings before playing CS2';
  end if;

  if p_mode = 'live' and coalesce(p_stake_amount, 0) > 0 and not coalesce(v_profile.steam_verified, false) then
    raise exception 'Verified Steam login is required before live-stake CS2 matches';
  end if;
end;
$$;

create or replace function public.enforce_quick_queue_steam_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('searching', 'ready_check', 'matched') then
    perform public.assert_user_has_cs2_identity(
      new.user_id,
      new.mode,
      coalesce(new.selected_stake_amount, 0)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_quick_queue_steam_identity on public.quick_queue_entries;
create trigger trg_enforce_quick_queue_steam_identity
before insert or update of user_id, mode, status, selected_stake_amount
on public.quick_queue_entries
for each row
execute function public.enforce_quick_queue_steam_identity();

create or replace function public.enforce_lobby_member_steam_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lobby public.lobbies%rowtype;
begin
  if new.left_at is not null or new.kicked_at is not null then
    return new;
  end if;

  select *
  into v_lobby
  from public.lobbies
  where id = new.lobby_id;

  if found and v_lobby.status in ('open', 'in_progress') then
    perform public.assert_user_has_cs2_identity(
      new.user_id,
      v_lobby.mode,
      v_lobby.stake_amount
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_lobby_member_steam_identity on public.lobby_members;
create trigger trg_enforce_lobby_member_steam_identity
before insert or update of user_id, lobby_id, left_at, kicked_at
on public.lobby_members
for each row
execute function public.enforce_lobby_member_steam_identity();

create or replace function public.snapshot_match_player_steam_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_match public.matches%rowtype;
begin
  select *
  into v_profile
  from public.profiles
  where id = new.user_id;

  if not found then
    raise exception 'Player profile not found';
  end if;

  select *
  into v_match
  from public.matches
  where id = new.match_id;

  if found then
    perform public.assert_user_has_cs2_identity(
      new.user_id,
      v_match.mode,
      coalesce((select l.stake_amount from public.lobbies l where l.id = v_match.lobby_id), 0)
    );
  end if;

  new.steam_id64 := v_profile.steam_id64;
  new.steam_verified := coalesce(v_profile.steam_verified, false);
  return new;
end;
$$;

drop trigger if exists trg_snapshot_match_player_steam_identity on public.match_players;
create trigger trg_snapshot_match_player_steam_identity
before insert or update of user_id, match_id
on public.match_players
for each row
execute function public.snapshot_match_player_steam_identity();

drop function if exists public.get_my_profile();
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
  demo_balance numeric,
  steam_id64 text,
  steam_verified boolean,
  steam_linked_at timestamptz,
  steam_last_verified_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select p.id, p.username, p.email, p.role, p.level, p.kyc_status, p.is_banned, p.suspended_until, p.cooldown_until,
         coalesce(w.available_balance,0), coalesce(w.locked_balance,0), coalesce(w.demo_balance,0),
         p.steam_id64, coalesce(p.steam_verified, false), p.steam_linked_at, p.steam_last_verified_at
  from public.profiles p
  left join public.wallets w on w.user_id = p.id
  where p.id = auth.uid();
$$;

grant execute on function public.update_my_steam_id64(text) to authenticated;
grant execute on function public.assert_user_has_cs2_identity(uuid, public.ha_mode, numeric) to authenticated;
grant execute on function public.get_my_profile() to authenticated;
