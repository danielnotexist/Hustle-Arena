-- 20260404_0003_friend_requests_and_dm_notifications.sql

create table if not exists public.friend_requests (
  id bigserial primary key,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  target_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(requester_id, target_id)
);

create table if not exists public.blocked_users (
  user_id uuid not null references public.profiles(id) on delete cascade,
  blocked_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, blocked_user_id),
  constraint blocked_no_self check (user_id <> blocked_user_id)
);

alter table public.friend_requests enable row level security;
alter table public.blocked_users enable row level security;

drop policy if exists friend_requests_select_participant on public.friend_requests;
create policy friend_requests_select_participant on public.friend_requests
for select using (requester_id = auth.uid() or target_id = auth.uid());

drop policy if exists friend_requests_insert_self on public.friend_requests;
create policy friend_requests_insert_self on public.friend_requests
for insert with check (requester_id = auth.uid());

drop policy if exists friend_requests_update_participant on public.friend_requests;
create policy friend_requests_update_participant on public.friend_requests
for update using (requester_id = auth.uid() or target_id = auth.uid());

drop policy if exists blocked_users_select_owner on public.blocked_users;
create policy blocked_users_select_owner on public.blocked_users
for select using (user_id = auth.uid());

drop policy if exists blocked_users_insert_owner on public.blocked_users;
create policy blocked_users_insert_owner on public.blocked_users
for insert with check (user_id = auth.uid());

drop policy if exists blocked_users_delete_owner on public.blocked_users;
create policy blocked_users_delete_owner on public.blocked_users
for delete using (user_id = auth.uid());

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
    created_at,
    type,
    message
  ) values (
    new.receiver_id,
    'direct_message',
    'New message',
    payload_text,
    '/squad-hub?friend=' || new.sender_id::text,
    jsonb_build_object('sender_id', new.sender_id),
    false,
    now(),
    'direct_message',
    coalesce(sender_name, 'User') || ' sent you a message'
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_direct_message on public.direct_messages;
create trigger trg_notify_direct_message
after insert on public.direct_messages
for each row
execute function public.notify_direct_message();
