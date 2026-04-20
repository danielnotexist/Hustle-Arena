# Scalability Readiness Plan

This document turns the current production pain points into an engineering plan for scaling Hustle Arena toward very high concurrency.

It is written against the current codebase state on `main` after the realtime/session responsiveness fix (`03e0b3d`).

## Executive summary
- The current app is functional for low-to-moderate traffic, but it is not yet architected for `200,000+` daily players with thousands of concurrent lobbies and live queue state changes.
- The biggest risk is not React itself. The bottlenecks are hot-path polling, broad Supabase reads, repeated session re-hydration, and frontend-owned orchestration of realtime game state.
- The frontend currently mixes three concerns in the same render loops:
  - authenticated user bootstrap
  - long-lived social and presence sync
  - hot live-match / lobby / queue state
- That coupling is already visible in production symptoms:
  - auth-token lock contention
  - delayed chat delivery
  - session overlays reappearing during background refreshes
  - heavy load bursts when browser visibility changes or multiple views mount together

## What the codebase is doing today

### 1. Session and auth bootstrap
- `src/features/use-supabase-session.ts` reconstructs the full platform user on startup by loading profile + wallet state together.
- It now avoids overlapping hydrations, but it still owns too much responsibility for hot-screen state.
- `src/App.tsx` separately tracks auth session presence and also runs several global polling loops.

### 2. Squad Hub / custom lobby flow
- `src/features/battlefield-view.tsx` loads:
  - lobby browser data
  - squad hub state
  - recent matches
  - active lobby state
  - match result notifications
- It combines polling and realtime subscriptions:
  - active lobby polling every `2000ms`
  - idle lobby polling every `8000ms`
  - lobby browser polling every `20000ms`
  - result popup polling every `1500ms`
  - realtime subscriptions on `lobbies`, `lobby_members`, `lobby_messages`, `map_vote_sessions`, `map_votes`, `matches`, and `match_players`
- Several actions were doing full `loadState()` refreshes after writes instead of reloading only the active slice.

### 3. Quick matchmaking flow
- `src/features/quick-match-view.tsx` still has several aggressive loops:
  - party invites polling every `1500ms`
  - party stake cap polling every `2500ms`
  - queue state sync every `1000ms`
  - connected lobby validation every `2500ms`
  - search clock every `1000ms`
  - ready-check sound polling every `750ms`
- It also keeps presence channels, local persistence, party orchestration, invite workflows, and queue sync in one client component.

### 4. Social / DMs
- `src/features/profile-social.tsx` uses realtime for messages and typing, but also had thread polling on top.
- We already reduced the DM thread polling pressure, but the broader social area still remains client-heavy and query-heavy.

### 5. Data access and backend shape
- `src/lib/supabase/matchmaking.ts` still relies heavily on fallback query paths such as:
  - `fetchOpenMatchmakingLobbiesFallback`
  - `fetchMyActiveLobbySummaryFallback`
  - `fetchMySquadHubStateFallback`
- `ACTIVE_LOBBY_SELECT` pulls nested lobby members, lobby messages, and map vote sessions together in one shape.
- That is convenient for UI coding, but it becomes expensive when many clients repeatedly request the same denormalized lobby envelope.

## Main scale blockers

### Blocker 1: Polling is still acting as a control plane
The app still depends on frequent polling for correctness in hot areas. At low scale this is tolerable. At high scale it becomes multiplicative load.

Why this is dangerous:
- `5,000` concurrent users polling queue state every second is already `5,000` hot reads per second before party invites, lobby state, browser data, or chat are counted.
- Polling does not naturally back off under load.
- Polling tends to overlap with realtime and visibility refocus bursts, producing thundering herd patterns.

### Blocker 2: Canonical live state is reconstructed through broad read models
Lobby and queue flows often refresh a broad state envelope rather than a specific resource delta.

Why this is dangerous:
- write one message -> reread full lobby
- toggle ready -> reread full lobby
- vote map -> reread full lobby
- join server -> reread full lobby
- complete match -> refresh session + reread lobby

At large concurrency, broad rereads waste database capacity and increase render work on clients.

### Blocker 3: Auth/session concerns are too close to gameplay concerns
The recent bug proved that background auth refresh could visibly impact active user flows.

Why this is dangerous:
- queue, social, and lobby UX should not stall because the platform user bootstrap path is doing profile/wallet reconstruction
- auth token lock contention becomes system-wide pain when many features read through the same session entry points

### Blocker 4: Supabase is being asked to be both system of record and high-frequency event bus
Supabase is a good canonical backend and a strong fit for product state, money state, and trusted workflows.
It is a weaker fit for extremely hot ephemeral state if every small UX pulse becomes a DB-driven read/write cycle.

What should stay in Supabase:
- auth
- wallets and ledger
- canonical lobby membership/state transitions
- match records
- notifications
- social graph

What should not stay exclusively DB-centric at very high scale:
- ultra-hot queue heartbeat loops
- transient ready-check pulses
- high-frequency lobby presence / typing / “who is online right now” style signals
- rapid fanout state that can be rebuilt from canonical records

### Blocker 5: Feature containers are still too monolithic
Several large components own networking, timers, persistence, optimistic UX, side effects, and view logic at once.

High-risk files:
- `src/App.tsx`
- `src/features/quick-match-view.tsx`
- `src/features/battlefield-view.tsx`
- `src/features/profile-social.tsx`

Why this is dangerous:
- duplicated fetch logic
- duplicated timer logic
- hard-to-reason overlapping effects
- larger re-render surfaces than necessary
- difficult performance profiling and ownership boundaries

## Target architecture for real scale

### Frontend rules
- Treat React as a view layer, not the source of truth for live orchestration.
- Move each hot domain to a dedicated query/subscription boundary:
  - auth session store
  - social store
  - queue state store
  - lobby state store
  - notifications store
- Replace full-screen refresh loops with domain-scoped state machines.
- Make background refresh silent and deduplicated.
- Add visibility-aware scheduling for every non-critical poller.

### Backend rules
- Keep Supabase/Postgres as the canonical state store.
- Introduce dedicated server-side read models and narrow RPCs for high-traffic screens.
- Separate canonical writes from fanout delivery.
- Move hot event distribution to an event-driven layer.

### Realtime model
- Canonical state transitions:
  - keep in Postgres / RPC / audited workflows
- Ephemeral live signals:
  - move to a lightweight event/presence channel
- Fanout:
  - publish delta events, not “refetch whole screen” hints

### Matchmaking model
- Queue placement and matching should run as a dedicated service or worker boundary, not as a UI-polled loop.
- Clients should subscribe to queue status updates keyed by player or party id.
- Match formation should emit a durable event once, with idempotent acceptance flow.

### Lobby model
- Every lobby needs:
  - canonical row state
  - small summary read model
  - active live channel for deltas
- Clients should fetch:
  - one initial snapshot
  - then apply event deltas
- Do not reread `lobby_messages + members + votes + match data` after every single mutation.

## Phased roadmap

## Phase 0: Stabilize the current app under moderate load
Status: started

Goals:
- stop auth/session lock contention
- reduce unnecessary polling
- reduce full-state rereads after writes

Already done:
- deduplicated session hydration and silent auth refresh in `use-supabase-session`
- reduced social thread refresh pressure
- reduced some Squad Hub full reloads
- prevented invalid ready toggles after map voting starts

Next changes in this phase:
- apply visibility-aware backoff to `quick-match-view.tsx`
- deduplicate quick queue polling requests and cancel stale responses
- stop using polling for party invites when realtime can cover it
- add central request dedupe utilities for hot reads

## Phase 1: Build dedicated read models for hot screens
Priority: highest

Needed backend work:
- add RPCs or materialized read paths for:
  - queue status by player
  - party invite summary by player
  - active lobby summary
  - lobby browser summary
  - unread DM counts
  - dashboard summary
- each RPC should return only the exact fields required for that surface

Expected impact:
- fewer repeated joins
- less nested payload hydration
- smaller network responses
- less client-side normalization work

## Phase 2: Replace control polling with event-driven fanout
Priority: highest

Needed architecture:
- a dedicated realtime/event service for:
  - queue updates
  - lobby member changes
  - ready-check state
  - typing / online presence
  - match lifecycle notifications

Possible options:
- Supabase Realtime for narrow delta streams only
- Redis + workers + websocket gateway
- a match-control service publishing events into a websocket tier

Expected impact:
- lower DB read amplification
- lower client churn
- better latency consistency
- less “minutes later” message delivery behavior under stress

## Phase 3: Split hot components into domain stores
Priority: high

Refactor targets:
- `quick-match-view.tsx`
  - extract queue sync engine
  - extract party invite state
  - extract ready-check orchestration
- `battlefield-view.tsx`
  - extract active lobby store
  - extract lobby browser store
  - extract vote/session store
- `profile-social.tsx`
  - extract DM thread store
  - extract unread count store
  - extract presence/typing transport
- `App.tsx`
  - remove global polling that belongs to domain features

Expected impact:
- smaller render surfaces
- clearer ownership
- easier perf tuning and metrics

## Phase 4: Operational hardening
Priority: mandatory before major traffic

Needed capabilities:
- request rate limits
- backpressure and retry budgets
- idempotency keys on all wallet and match-side effects
- structured tracing for RPC latency and realtime fanout delay
- alarms for:
  - lock contention
  - queue sync latency
  - lobby state fetch latency
  - delayed notifications
  - websocket/realtime disconnect rates

## Immediate engineering decisions

### Decision 1: Do not scale hot queue loops by increasing frontend polling
That approach will break first and fail noisily.

### Decision 2: Keep money and canonical match state in audited workflows
Do not move settlement, stake locking, or final match outcomes into client-owned orchestration.

### Decision 3: Introduce a dedicated hot-state transport
For true large scale, queue and live lobby signals need a fast fanout layer separate from broad Postgres reads.

### Decision 4: Prioritize read-model RPCs before cosmetic frontend work
The largest performance wins now are architectural, not visual.

## Recommended next implementation batch

1. Refactor `quick-match-view.tsx` to stop `1000ms` / `1500ms` / `2500ms` overlapping control loops and gate non-critical polling by visibility.
2. Create dedicated RPCs for:
   - `get_my_quick_queue_projection`
   - `get_my_party_invite_projection`
   - `get_my_active_lobby_projection`
3. Replace “reload whole active lobby” after message / ready / team / vote mutations with optimistic local updates plus delta confirmation.
4. Add a tiny shared client utility for:
   - in-flight dedupe
   - stale-response cancellation
   - visibility-aware polling
   - jittered backoff
5. Add metrics instrumentation around:
   - queue sync duration
   - lobby refresh duration
   - DM send-to-render delay
   - auth session hydrate duration

## Definition of ready for serious scale testing
Before running large-scale load simulation, the system should meet all of these:
- no control-plane polling tighter than necessary for correctness
- no full-screen session interruptions during background auth refresh
- queue state available through a narrow projection endpoint or event stream
- lobby state updated primarily by deltas, not broad rereads
- DM delivery not dependent on fallback polling for correctness
- observability in place for latency, fanout delay, and error burst detection

## Bottom line
React was the right move for maintainability and modern UX, but React is not the scale strategy by itself.

The real scale strategy is:
- narrow projections
- event-driven hot paths
- strict separation between canonical state and ephemeral live state
- deduplicated background work
- operational visibility

That is the path that will let Hustle Arena handle heavy realtime traffic without turning the browser, Supabase, or the match flows into a bottleneck.
