-- 20260404_0003_friend_requests_and_dm_notifications.sql

-- Core social tables and RLS policies are defined in 20260404_0001_platform_core.sql.
-- This migration keeps the DM notification trigger separate so it can evolve independently.

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
