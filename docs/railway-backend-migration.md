# Railway Backend Migration

Updated: 2026-04-29

This document tracks the migration from a Vercel-only runtime shape toward:

- Vercel: React/Vite frontend only.
- Railway: private Node backend, workers, scheduled jobs, and privileged orchestration.
- Supabase: Postgres, auth, RLS, storage, RPC, and realtime.

## Current First Step

The repo now has a Railway-ready backend scaffold under `backend/`.

Entrypoints:

- `backend/index.ts`: HTTP API service.
- `backend/worker.ts`: background worker placeholder.
- `backend/scheduler.ts`: scheduled jobs placeholder.

Scripts:

- `npm run dev:backend`
- `npm run start:backend`
- `npm run start:worker`
- `npm run start:scheduler`

Initial API routes:

- `GET /health`
- `GET /api/me`
- `GET /api/admin/health`
- `GET /api/missions`
- `POST /api/missions/accept`
- `POST /api/vault/purchase`

The missions and vault routes are intentionally lightweight compatibility routes. They prove that the Vercel frontend can call the Railway backend through `VITE_API_BASE_URL`.

## Railway Environment

Set these variables on the Railway backend services:

- `NODE_ENV=production`
- `PORT`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `FRONTEND_ORIGIN=https://your-vercel-domain`

For preview/staging, `FRONTEND_ORIGIN` can contain a comma-separated list:

```text
FRONTEND_ORIGIN=http://localhost:5173,https://your-preview-domain
```

Never expose `SUPABASE_SERVICE_ROLE_KEY` in Vercel or any frontend environment.

## Vercel Environment

Set these variables on the Vercel frontend:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_API_BASE_URL=https://your-railway-backend-domain`
- `VITE_PLATFORM_HOT_WALLET_ADDRESS`
- `VITE_PLATFORM_HOT_WALLET_NETWORK`

Do not add service-role keys to Vercel.

## Railway Services

Create separate Railway services from the same repository when the workflows are ready:

- API service: `npm run start:backend`
- Worker service: `npm run start:worker`
- Scheduler service: `npm run start:scheduler`

Start with only the API service. Add worker and scheduler services when the first real queue or cleanup task is migrated.

The repo includes `railway.json` for the API service:

- Build command: `npm ci && npm run build`
- Start command: `npm run start:backend`
- Health check: `/health`

## Migration Order

1. Deploy `backend/index.ts` to Railway and verify `GET /health`.
2. Set `VITE_API_BASE_URL` in Vercel and verify missions/vault calls hit Railway.
3. Move privileged Steam ID bridge behavior behind Railway if it needs service-role access.
4. Move admin finance actions behind Railway endpoints.
5. Add scheduled cleanup jobs for expired invites, stale queue entries, abandoned lobbies, and old notifications.
6. Add a worker loop for durable jobs stored in Supabase tables.
7. Move heavy client orchestration into focused backend endpoints or Supabase RPCs.
8. Add request logging, endpoint metrics, and alerting before real production traffic.

## Backend Ownership Rules

Railway should own:

- service-role Supabase calls
- private provider/API secrets
- admin-only writes
- wallet-sensitive workflows
- queue claiming and retries
- scheduled cleanup
- abuse/rate-limit enforcement

Supabase should own:

- canonical tables
- migrations
- RLS
- transactional RPCs
- auth
- realtime channels that work well directly from the browser

Vercel should own:

- the static React app
- public browser configuration only
- CDN delivery
