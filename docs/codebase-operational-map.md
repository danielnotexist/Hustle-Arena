# Codebase Operational Map

Updated: 2026-04-21

This file is a working map of the current Hustle Arena codebase so future bug-fix and scale work can start from shared context instead of rediscovery.

## Snapshot
- Frontend stack: React 19 + Vite 6 + TypeScript.
- Primary backend target: Supabase (`src/lib/supabase.ts`, `supabase_setup.sql`, `supabase/migrations/`).
- Transitional backend still present: Firebase auth/firestore (`src/firebase.ts`) and local Express + SQLite dev server (`server.ts`).
- Validation currently available: `tsc --noEmit`, migration validation, production build.
- Current build health: `npm run check` passes.
- Current build warning: main JS bundle is about `1.78 MB` before gzip, which is already a scale and startup concern.

## Repo Shape
- `src/`: 35 files.
- `src/features/`: 13 files.
- `src/lib/`: 9 files.
- `src/lib/supabase/`: 5 files.
- `supabase/migrations/`: 61 SQL migrations.
- `docs/`: 2 existing architecture/planning docs.

## Main Runtime Entry Points
- `src/main.tsx`
  Boots the React app.
- `src/App.tsx`
  The main app shell. Owns navigation, session recovery screens, global notifications, party invites, global presence, and cross-feature modal/toast state.
- `src/features/use-platform-session.ts`
  Chooses the active session provider.
- `src/features/use-supabase-session.ts`
  Main Supabase session hydration path.
- `src/features/use-legacy-firebase-session.ts`
  Transitional legacy auth/profile path that still exists for non-Supabase environments.

## Feature Map
- `src/features/quick-match-view.tsx`
  Hot quick-queue and party matchmaking surface. Owns queue state, party invites, party stake changes, ready-check behavior, presence, local persistence, and queue/lobby transition logic.
- `src/features/battlefield-view.tsx`
  Custom lobby browser and Squad Hub. Owns active lobby state, lobby browser state, team assignment, chat, map voting, match launch/join, and result popup polling.
- `src/features/profile-social.tsx`
  Profiles, public profiles, comments, social graph, direct messages, lobby invites, unread counts, and Squad Hub side flows.
- `src/features/navigation-dashboard.tsx`
  Dashboard summary screen, recent matches, open rooms, and leaderboard snapshots.
- `src/features/admin-finance.tsx`
  Wallet deposit/withdrawal flows and admin finance panel. Uses Supabase when configured, but still contains Firebase fallback paths.
- `src/features/platform-views.tsx`
  Secondary content surfaces such as Apex List, Vault, Forums, Arena TV, Syndicates, and Hustle Prime.
- `src/features/landing-auth.tsx`
  Landing, auth, and KYC UI.

## Data Access Map
- `src/lib/supabase/profile.ts`
  Profile bootstrap, wallet bootstrap, mode switching, admin profile reads/updates.
- `src/lib/supabase/social.ts`
  Friend requests, public profile reads, leaderboard, comments, notifications.
- `src/lib/supabase/matchmaking.ts`
  Largest data-access module. Owns lobby RPCs, lobby fetches, quick queue, party invites, ready checks, match bootstrap, reconnect, demo completion, and multiple fallback query paths.
- `src/lib/supabase/wallet.ts`
  Deposit, withdrawal, payout admin workflows.
- `src/lib/supabase/types.ts`
  Shared Supabase record types.

## Backend Surface Area
- Tables currently defined: 28.
- Public SQL functions currently defined: 66.

### Table groups
- Identity/social: `profiles`, `friends`, `friend_requests`, `blocked_users`, `direct_messages`, `notifications`, `profile_comments`.
- Wallet/custody: `wallets`, `wallet_ledger`, `deposit_requests`, `withdrawal_requests`, `payout_jobs`, `treasury_audit_log`.
- Matchmaking/lobbies: `lobbies`, `lobby_members`, `lobby_invites`, `lobby_messages`, `map_vote_sessions`, `map_votes`.
- Match lifecycle: `matches`, `match_players`, `match_events`, `penalties`.
- Quick queue: `quick_queue_entries`, `quick_queue_party_invites`, `quick_queue_party_stake_updates`, `quick_queue_ready_checks`, `quick_queue_ready_check_members`.

### Function groups
- Profile/session bootstrap: `get_my_profile`, `ensure_my_platform_account`, `sync_profile_from_auth_user`.
- Social: `send_friend_request`, `respond_friend_request`, `get_public_profile_basics`, `get_public_profile_details`, `find_public_profile_by_username`, `get_profile_comments`, `add_profile_comment`, `delete_profile_comment`.
- Lobby/match control: `create_matchmaking_lobby`, `join_matchmaking_lobby`, `leave_matchmaking_lobby`, `set_lobby_member_ready`, `set_lobby_member_team_side`, `kick_lobby_member`, `send_lobby_message`, `start_lobby_match`, `player_join_match_server`.
- Voting/server: `ensure_lobby_map_vote_session`, `cast_lobby_map_vote`, `sync_map_vote_session`, `sync_lobby_auto_veto`, `build_cs2_server_config`, `get_match_server_bootstrap`, `mark_match_server_allocated`.
- Quick queue: `quick_queue_join_or_match`, `quick_queue_accept_match`, `quick_queue_cancel`, `get_my_quick_queue_status`, `send_quick_queue_party_invite`, `respond_quick_queue_party_invite`, `request_quick_queue_party_stake_update`, `respond_quick_queue_party_stake_update`.
- Wallet/admin: deposit, withdrawal, payout, and admin stats/match settlement functions.

## Known Hotspots
- `src/App.tsx`
  Global shell is still doing feature-level polling for reconnectable match, custom-lobby redirect checks, notifications, party invites, and site-wide presence updates.
- `src/features/quick-match-view.tsx`
  This is the hottest file in the repo for scale risk. It combines multiple polling loops, realtime subscriptions, queue orchestration, party orchestration, and UI state in one component.
- `src/features/battlefield-view.tsx`
  Active lobby polling and browser polling are mixed with realtime refresh triggers and heavy denormalized lobby reads.
- `src/features/profile-social.tsx`
  Social and DM flows use a mix of realtime and fallback polling, plus direct table reads from the component.
- `src/lib/supabase/matchmaking.ts`
  Central high-risk data-access layer because many app-critical flows converge here and it still contains fallback logic for old read paths.

## Legacy and Mixed-Mode Risk
- Firebase is still active in `src/firebase.ts`, `src/features/use-legacy-firebase-session.ts`, and Firebase fallback branches in `src/features/admin-finance.tsx`.
- Local Express + SQLite in `server.ts` is useful dev scaffolding but should not be treated as production architecture.
- This mixed mode means some bugs may be caused by transition boundaries, not by one subsystem alone.

## Operational Health Today
- `npm run check` passes.
- Migration validator currently checks schema drift only in a narrow way.
- There is no real automated test suite for domain behavior, scaling behavior, or money-sensitive workflows.
- The biggest immediate non-functional warning is the large single frontend bundle and the amount of client-owned orchestration.

## Recommended Order For Bug Fix Campaign
1. `src/features/quick-match-view.tsx`
   Highest bug density and highest scale sensitivity.
2. `src/features/battlefield-view.tsx`
   Heavy live-state surface and custom lobby correctness risk.
3. `src/features/profile-social.tsx`
   Realtime delivery, unread counts, and mixed data path complexity.
4. `src/App.tsx`
   Move global feature polling out of the shell.
5. `src/lib/supabase/matchmaking.ts`
   Tighten data contracts and remove expensive fallback behaviors.
6. Firebase fallback areas
   Shrink transition logic to reduce split-brain bugs.

## Immediate Scale Priorities
1. Replace hot polling loops with narrower projections and event-driven deltas where possible.
2. Split queue state, lobby state, social state, and session state into cleaner ownership boundaries.
3. Reduce full-lobby rereads after small mutations.
4. Add dedicated narrow RPC/read models for the hottest screens.
5. Break up the app bundle with code-splitting and route/feature chunking.
6. Add real observability for queue sync latency, lobby refresh latency, notification delay, and auth hydrate duration.

## What To Assume Going Into The Next Bug Pass
- Most serious bugs will likely sit at the boundaries between polling, realtime, and local persisted state.
- Under high load, quick queue and active lobby flows are the first systems likely to degrade.
- Money, match outcome, and admin override flows must be treated as correctness-critical, not just UI-critical.
- If a bug appears random in the browser, check for duplicate fetches, overlapping effects, and mixed legacy/Supabase paths first.
