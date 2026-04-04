-- 20260404_0002_squad_dm_slice.sql
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
