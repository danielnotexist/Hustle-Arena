# Railway Backend Migration

Updated: 2026-05-03

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

## 2026-05-03 Progress Snapshot

This section is the handoff note for future sessions. Production and preview are both active, but they must remain isolated.

### Live URLs

- Production frontend: `https://project-7y6n1.vercel.app`
- Preview frontend: `https://hustlearena-git-preview-danielnotexists-projects.vercel.app`
- Railway API service: `Hustle-Arena`
- Railway public API: `https://hustle-arena-production.up.railway.app`

### Current Railway Environment

`FRONTEND_ORIGIN` is intentionally a comma-separated allow-list with exactly the two known frontend origins:

```text
FRONTEND_ORIGIN=https://project-7y6n1.vercel.app,https://hustlearena-git-preview-danielnotexists-projects.vercel.app
```

Do not force preview to production, and do not force production to preview. Steam login now passes the current origin as `returnOrigin`; Railway signs it into state and returns to that same allowed origin.

### Steam Auth Flow

Current Steam auth ownership lives in `backend/routes/steam.ts` and `src/lib/steam.ts`.

- Frontend calls `GET /api/steam/login/start?returnOrigin=<current-origin>`.
- Railway validates `returnOrigin` against `FRONTEND_ORIGIN`.
- Steam OpenID callback verifies the SteamID64 server-side.
- Railway fetches public Steam XML profile data.
- Railway creates/updates the Supabase user/profile.
- Railway creates a Supabase session server-side and redirects directly to `<returnOrigin>/#access_token=...`.
- This avoids Supabase hosted magic-link Site URL fallback, which previously mixed production and preview domains.

Important: the old Supabase magic-link redirect path was removed because it could fall back to the wrong Vercel/Supabase Site URL.

### Steam Profile Details

Steam login now stores public Steam profile data when available:

- `profiles.steam_avatar_url`
- `profiles.steam_member_since`
- `profiles.steam_profile_url`
- `profiles.steam_profile_fetched_at`

The user's profile avatar falls back to the Steam avatar when available. Public profile pages expose verified Steam identity details through `get_public_profile_details`.

Relevant migrations:

- `20260502_0066_steam_persona_display_names.sql`
- `20260502_0067_steam_profile_summary.sql`
- `20260503_0068_public_profile_steam_identity.sql`

### Steam Username Policy

Steam persona names are display names. The platform no longer appends uniqueness suffixes like `_605` to Steam usernames.

Migration `20260502_0066_steam_persona_display_names.sql` drops the unique username constraint and cleans existing verified Steam profile names/auth metadata.

### Steam Account Eligibility Gate

The first anti-abuse gate is Steam account age:

- Steam accounts must have at least 1 year of recorded Steam activity.
- If `memberSince` is missing because the Steam profile is private/hidden, the user is rejected with a privacy-settings popup.
- If `memberSince` is present but under 1 year old, the user is rejected with the 1-year eligibility popup.

Date parsing was hardened because Steam can return partial dates like `May 3`; JavaScript used to parse that as `May 3, 2001`, which incorrectly made new accounts look old enough. The backend now parses partial dates as the latest matching date this year/last year.

### Legal Disclaimer Gate

The login UI now shows a disclaimer before Steam login:

```text
Hustle-Arena is a skill-based competitive tournament platform where success is earned - not chanced. Our matches/tournaments are solely designed around pure gaming performance and strategy with highly enforced fair gameplay and Strictly DOES NOT constitute gambling or betting under applicable legal standards.
```

Buttons:

- `I acknowledge`: starts Steam login.
- `I refuse`: closes the modal and returns to the landing page.

### Profile UI Updates

Own profile:

- Steam Identity card shows SteamID64.
- Shows `Steam member since` and account age when available.

Public profile:

- Header shows verified SteamID64.
- Header shows accurate Steam member period/account age.

### Notification And Message Menus

The notifications/messages dropdown was moved above active sections with a higher fixed overlay/z-index and outside-click/Escape handling. This fixed menus being visually overlaid and unresponsive inside battlefield/profile sections.

### Profile Comments Repair

Profile comments table/policies existed in live Supabase, but PostgREST was missing `get_profile_comments` in the schema cache after refresh. Added repair migration:

- `20260503_0069_profile_comments_rpc_repair.sql`

Also sent live schema reload:

```sql
notify pgrst, 'reload schema';
```

Frontend now treats a transient missing `get_profile_comments` RPC/cache error as an empty comments list instead of showing a red error toast.

### Recent Commits Pushed To `main`

- `ffec7b2` - `Use Steam persona names without suffixes`
- `e110855` - `Return Steam login to requesting Vercel origin`
- `9ee5edb` - `Keep notification menu above active sections`
- `6387db3` - `Add Steam sign-in disclaimer gate`
- `7f8a315` - `Show Steam disclaimer errors inline`
- `10b459e` - `Skip Supabase session for Steam login start`
- `59c5191` - `Redirect Steam login without browser fetch`
- `4850240` - `Fetch Steam profile summary on login`
- `b34682b` - `Require one year Steam account age`
- `dcffc10` - `Handle private Steam account age`
- `b6d70ff` - `Parse partial Steam member dates safely`
- `63ddaf2` - `Delay session recovery screen`
- `bd50b35` - `Show Steam identity on public profiles`
- `70d81fb` - `Return Steam sessions to canonical production`
- `22d70cc` - `Redirect noncanonical Vercel domain`
- `a3a7acc` - `Force canonical production domain`
- `4600947` - `Keep production and preview auth isolated`
- `f84d6a4` - `Gracefully handle missing comments RPC cache`

Note: commits `70d81fb`, `22d70cc`, and `a3a7acc` were superseded by `4600947` for domain behavior. The desired final behavior is isolation, not canonical forcing.

### Verification Commands Used

Use PowerShell on Windows:

```powershell
npm.cmd run check
railway.cmd variable list --service Hustle-Arena --kv
railway.cmd deployment list --service Hustle-Arena
```

Steam return-origin verification can be done by calling `/api/steam/login/start` with each `returnOrigin` and decoding the signed state payload. The expected result:

- Production start state returns `https://project-7y6n1.vercel.app`
- Preview start state returns `https://hustlearena-git-preview-danielnotexists-projects.vercel.app`

Railway CORS should return matching `Access-Control-Allow-Origin` for both frontend origins.
