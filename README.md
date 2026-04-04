# Hustle Arena React Migration Plan

This project is now the source of truth for the React + Vite architecture.

## Current status
- UI shell works.
- Firebase auth/profile is active in `src/firebase.ts` and `src/App.tsx`.
- Supabase client exists in `src/lib/supabase.ts`.
- Core Supabase platform schema has been prepared in:
  - `supabase_setup.sql`
  - `supabase/migrations/20260404_0001_platform_core.sql`

## Phase-by-phase migration (safe path)
1. Data foundation (done in this step)
- Profiles, wallets, notifications, friends, DMs
- Lobbies, members, invites, chat, map voting
- Matches, match events, penalties
- Admin terminate lobby function with refund + notifications
- Leaderboard/live/recent match reporting views

2. Auth + Profile cutover
- Replace Firebase auth/profile reads with Supabase auth + `get_my_profile()`
- Keep current UI look and interactions

3. Notifications and bell parity
- Real unread badge count
- Dropdown list with actions and navigation target
- DM, friend request, game invite notice types

4. Matchmaking parity
- Demo/Live, Public/Custom
- Stake + players + password creation flow
- Team boxes (T/CT), ready state, kick flow
- Dynamic lobby browser + join redirection fix

5. Real-time parity
- Supabase realtime channels for lobbies/messages/invites/notifications
- Remove manual refresh dependencies

6. Admin panel parity
- Suspend/ban/unban/delete users
- Terminate demo/live matches with zero-fee refunds
- Force-close stale lobbies

7. Penalties and interruption logic
- Abandon timers, surrender/risk vote window, cooldown penalties
- Funds split rules and notification popups

## Important notes
- We are intentionally migrating in slices to keep the app stable.
- Existing Firebase flow can remain during transition until each feature is fully replaced.
