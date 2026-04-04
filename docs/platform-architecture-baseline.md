# Platform Architecture Baseline

This document defines the architecture baseline we should preserve before implementing new product logic.

## Product pillars
- Identity: players authenticate, connect Steam, manage profile, social graph, trust state, and KYC state.
- Wallets: players deposit USDT, funds are tracked in a ledger, balances are locked for matches, and payouts are settled per player.
- Matchmaking: players create or join public/custom lobbies, invite friends, ready up, and progress into live matches.
- Server orchestration: the platform provisions dedicated servers, binds match metadata to those servers, and ingests live match telemetry back into the platform.
- Settlement: winning players receive stake-based payouts minus platform fees or future subscription-based fee overrides.
- Integrity: anti-cheat, moderation, abandon penalties, interruption handling, and dispute-ready audit trails protect the ecosystem.
- Media and community: notifications, DMs, HLTV-style live coverage, forums, and future social features extend retention around the core match loop.

## Core domains
### Identity and access
- Supabase auth should become the primary auth layer.
- Steam account linking should live in its own integration boundary and never be mixed directly into UI state code.
- Roles, KYC status, bans, suspensions, cooldowns, and linked external identities should be treated as domain state, not ad hoc UI flags.

### Wallet and custody
- Wallet balances must always be backed by append-only ledger entries.
- Match stake locking and payout settlement should be implemented as service workflows with clear idempotency keys.
- Match fee policy should be configurable per player or subscription tier so Arena-VIP can later waive or reduce fees safely.
- The frontend may display the platform hot wallet address, but deposit crediting, withdrawal signing, sweep-to-cold-wallet automation, and reconciliation must remain server-side responsibilities.

### Matchmaking and lobby lifecycle
- Lobby creation, invites, membership, ready state, map voting, and team assignment should be modeled as state transitions.
- The UI should read canonical lobby state from Supabase and eventually from realtime subscriptions, not from local mock state.
- Every player-facing transition should be auditable because wallet locks depend on it.

### Dedicated server orchestration
- Match records should own the linkage to server instance id, endpoint, and lifecycle status.
- A server control worker should be responsible for allocate, warm, start, monitor, and teardown flows.
- Telemetry ingestion should be designed as a separate pipeline from the user-facing app so stats sync remains reliable under load.

### Match results and settlement
- The source of truth for winners, losers, and interrupted states should be server telemetry plus platform moderation overrides.
- Settlement should run as an explicit post-match workflow, not inline in the UI.
- Interrupted matches need deterministic refund rules, ledger entries, notifications, and admin override tooling.

### Social and retention
- Friends, DMs, notifications, and future forums or feed systems should be modular so they do not pollute wallet or match logic.
- HLTV-like live views should be read models built from canonical match and event data, not separate state stores.

## Recommended frontend boundaries
- `src/features/auth`: sign-in, registration, linked account flows, session boundaries.
- `src/features/profile`: player profile, settings, KYC, trust state.
- `src/features/social`: friends, DMs, invites, notifications.
- `src/features/matchmaking`: lobby browser, create lobby, ready state, map voting, live match shell.
- `src/features/wallet`: balances, deposits, withdrawals, ledger views, staking UX.
- `src/features/admin`: moderation, KYC review, match intervention, stale lobby management.
- `src/features/platform`: shared hooks, realtime subscriptions, route shells, cross-feature state.

## Recommended backend boundaries
- Auth service: identity, session, Steam linking, roles.
- Wallet service: deposits, withdrawals, ledger, lock/unlock, settlement.
- Match service: lobbies, invites, map voting, match state, penalties.
- Server control service: provision, monitor, teardown, telemetry bridge.
- Reporting service: leaderboard, live matches, recent matches, HLTV-style read models.
- Trust and safety service: anti-cheat signals, moderation actions, risk scoring, evidence logs.

## Non-negotiable engineering rules
- Money state must be ledger-driven and auditable.
- Server events must be idempotent and replay-safe.
- Settlement code must be isolated from UI concerns.
- Admin override flows must emit notifications and ledger or audit records.
- Realtime UX should subscribe to canonical backend state, not invent parallel client state.

## Immediate prep goals before feature work
1. Finish breaking the monolithic app shell into domain-oriented feature folders.
Status: completed for the current UI shell.
2. Replace transitional Firebase session handling with a Supabase-ready session boundary.
Status: completed at the app boundary through `use-platform-session`, with Firebase still serving as the current fallback provider.
3. Define typed data-access modules for profiles, social, lobbies, wallets, and notifications.
Status: started for profiles and wallets under `src/lib/supabase/`; social and matchmaking should be next.
4. Keep migrations coherent and additive so money-sensitive logic is never built on drifting schemas.
Status: in place with migration validation and corrected notification schema usage.
