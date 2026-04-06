# Hustle Arena Workspace

This project is the active React + Vite workspace for Hustle Arena.

## Current status
- UI shell works.
- Firebase auth/profile is active in `src/firebase.ts` and `src/App.tsx`.
- Supabase client exists in `src/lib/supabase.ts`.
- Supabase is the target backend and schema source of truth.
- Core Supabase platform schema lives in:
  - `supabase_setup.sql`
  - `supabase/migrations/20260404_0001_platform_core.sql`
- Migration validation is available through `npm run validate:migrations`.
- Full workspace verification is available through `npm run check`.

## Workspace guardrails
- `supabase_setup.sql` should stay aligned with the migration files.
- New backend features should target Supabase first; Firebase is transitional.
- `server.ts` is local dev scaffolding, not the long-term production backend.
- Platform domain boundaries are documented in `docs/platform-architecture-baseline.md`.
- Session access should flow through `src/features/use-platform-session.ts`.
- Typed Supabase profile and wallet access now lives under `src/lib/supabase/`.
- The platform hot wallet display config is provided through `VITE_PLATFORM_HOT_WALLET_ADDRESS` and `VITE_PLATFORM_HOT_WALLET_NETWORK`.

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

## Important notes.
- We are intentionally migrating in slices to keep the app stable.
- Existing Firebase flow can remain during transition until each feature is fully replaced.
- The workspace currently passes TypeScript, migration validation, and production build checks.
