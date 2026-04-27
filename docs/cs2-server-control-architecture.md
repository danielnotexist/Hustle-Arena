# CS2 Server Control And Telemetry Architecture

Updated: 2026-04-25

This document defines the first production-shaped contract for Hustle Arena to control external dedicated CS2 servers. The first test provider can be a single Google Cloud Platform VM, but the database and service boundary are provider-neutral so a later modular VPS fleet can replace GCP without changing core matchmaking or settlement logic.

## Goal

When a CS2 lobby becomes match-ready, the platform should:

1. Create or reuse a canonical `matches` row with CS2 bootstrap config.
2. Automatically queue an allocation job for a server-control worker.
3. Let a worker claim exactly one allocation job.
4. Provision or prepare one external server.
5. Mark the server endpoint as ready.
6. Unlock the player-facing `Join Server` button only after the endpoint is ready.
7. Receive heartbeats and telemetry from the running server.
8. Queue settlement when the match ends.
9. Queue refunds if the server fails or players cannot join.
10. Queue teardown once the match is finished, interrupted, or abandoned.

## New Contract

Migration:

- `supabase/migrations/20260425_0062_cs2_server_control_and_telemetry_contract.sql`

Frontend/shared Supabase module:

- `src/lib/supabase/server-control.ts`

Tables:

- `server_instances`
  Tracks provider, region, external instance ID, endpoint, lifecycle status, heartbeats, and failure reason.

- `match_server_telemetry_events`
  Append-only telemetry stream. Every server event should have an `event_id` when possible so retries are idempotent.

- `match_lifecycle_jobs`
  Durable queue for allocation, monitoring, teardown, settlement, and interrupted-match refund work.

Trigger:

- `trg_enqueue_cs2_server_allocation_from_match`
  Watches CS2 `matches` rows. When a pending/live match appears with `server_status = awaiting_allocation`, it creates or refreshes the `server_instances` row and queues one idempotent `allocate_server` lifecycle job.

Core RPCs:

- `queue_match_server_allocation(match_id, provider, provider_region)`
  Queues an allocation job. Initial provider should be `gcp-test`.

- `claim_next_match_server_allocation(worker_id, provider, provider_region, claim_seconds)`
  Worker claims one allocation job and receives the CS2 bootstrap payload.

- `record_match_server_status(...)`
  Worker records provisioning, booting, ready, live, draining, terminated, or failed.

- `record_match_server_heartbeat(...)`
  Server agent or worker records liveness.

- `record_match_server_telemetry(...)`
  Server agent records match events. `match_end` queues settlement. `server_crashed` queues interrupted refund.

- `queue_match_server_teardown(match_id, reason)`
  Queues teardown and moves the server toward draining.

## GCP Test Shape

For the first 10-user test, keep the system intentionally small:

- One GCP project.
- One region near the testers.
- One reusable VM or one VM created per match, depending on budget and setup speed.
- One worker process with Supabase service-role credentials.
- One CS2 server agent on the VM.

Recommended first pass:

- Use a single warm VM for testing.
- Worker claims a job, configures the warm VM for the match, starts CS2, then calls `record_match_server_status(..., "ready", endpoint)`.
- The server agent sends heartbeat every 10-20 seconds.
- The server agent sends `match_live` once all required players connect.
- The server agent sends `match_end` with final score and per-player stats.
- Worker queues teardown after `match_end`, but for the first GCP test it can reset the warm server instead of deleting the VM.

This proves the communication contract before spending money on dynamic provisioning.

## Provider Boundary

Provider-specific code must live outside the React app and outside SQL business logic.

The worker owns:

- GCP API calls.
- VM creation or warm-VM reset.
- Firewall and port readiness checks.
- CS2 installation/start commands.
- Server-agent deployment.
- Provider-specific cleanup.

Supabase owns:

- Durable match state.
- Allocation and teardown job queues.
- Server lifecycle state.
- Telemetry event storage.
- Settlement/refund job scheduling.
- Notifications and audit trails.

React owns:

- Showing server status.
- Showing the join endpoint only after `server_status` is `ready`, `allocated`, or `live`.
- Showing interruption/refund notifications.
- Showing match results and profile history.

## Required Future Slice

The next backend slice should add live settlement, not just demo settlement:

- Lock live stake before server allocation.
- Refuse allocation if any player cannot fund the stake.
- Store a per-match stake-lock idempotency key.
- Settle winners from locked funds only.
- Refund all locked funds on no-show, crash, or admin cancellation.
- Make every settlement/refund operation idempotent.

Until that exists, GCP tests should run in demo mode or with zero live stake.

## Telemetry Event Types

Initial event names:

- `heartbeat`
- `server_ready`
- `match_live`
- `player_connected`
- `player_disconnected`
- `round_end`
- `score_update`
- `match_end`
- `server_crashed`

Every event payload should include:

- `matchId`
- `serverInstanceId` or provider instance ID when available
- CS2 map
- current score if known
- connected player identifiers when relevant
- server timestamp

For `match_end`, payload should include:

- `winningSide`
- `scoreT`
- `scoreCT`
- `players[]` with user id, Steam id if known, team side, kills, deaths, assists, score, and disconnected/abandoned flags

## Failure Rules

The first worker should treat these as interrupted-match candidates:

- Server fails to become ready before timeout.
- Server heartbeat is missing for longer than the configured timeout.
- Required players do not connect before join deadline.
- Server reports `server_crashed`.
- Provider returns unrecoverable provisioning failure.

The database now queues `refund_interrupted_match` when `server_crashed` telemetry arrives. The actual refund function still needs to be implemented as a later money-sensitive slice.

## Why This Shape

The important design choice is that external server control is job-driven and idempotent. The frontend never directly opens or closes VPS instances. The worker can retry safely, telemetry can be replayed safely, and the later settlement engine can trust one canonical match/event stream.
