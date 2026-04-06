-- 20260406_0017_close_orphaned_open_lobbies.sql

update public.lobbies l
set status = 'closed',
    close_reason = coalesce(l.close_reason, 'Lobby emptied'),
    map_voting_active = false,
    join_server_deadline = null,
    updated_at = now()
where l.status = 'open'
  and not exists (
    select 1
    from public.lobby_members lm
    where lm.lobby_id = l.id
      and lm.kicked_at is null
      and lm.left_at is null
  );
