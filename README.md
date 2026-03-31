# Hustle-Arena

Hustle-Arena is a self-wagering CS2 platform MVP built as a monorepo with:

- `apps/web`: React + Vite + Tailwind
- `apps/server`: Node + Express + Socket.IO
- `packages/shared-types`: shared domain contracts
- `supabase/migrations`: schema and RPC functions for wallet, KYC, matchmaking, and settlement logic

## Setup

1. Copy [`.env.example`](./.env.example) to `.env` values for local development.
2. Apply the Supabase migrations in order:
   - `supabase/migrations/20260331000000_initial_schema.sql`
   - `supabase/migrations/20260331000001_advanced_features.sql`
   - `supabase/migrations/20260331000002_mvp_foundation.sql`
3. Install dependencies:

```bash
npm install
```

4. Run the apps:

```bash
npm run build --workspace @hustle-arena/shared-types
npm run dev --workspace @hustle-arena/server
npm run dev --workspace @hustle-arena/web
```

## Checks

Best available checks in this repo:

```bash
npm run build --workspace @hustle-arena/server
npm run build --workspace @hustle-arena/web
npm run lint
```

## Environment Notes

- `AUTO_APPROVE_KYC=true` keeps the MVP flow usable without a backoffice reviewer. Set it to `false` in real review environments.
- `VITE_API_BASE_URL` should point at the Express API when the web app and API are not on the same origin.
- `CS2_CALLBACK_SHARED_SECRET` is required on the dedicated server callback route as `x-hustle-signature`.
- `DEPOSIT_ADDRESS_TRC20` and `DEPOSIT_ADDRESS_BEP20` are the displayed custodial deposit rails for the wallet page.

## Rollout Notes

- Web can be deployed on Vercel as the frontend surface for `apps/web`.
- The Express + Socket.IO API should be deployed as a persistent Node service with the same env values exposed to the web app via `VITE_API_BASE_URL`.
- Supabase must have the migration RPCs applied before wallet, VIP, withdrawal, or match settlement actions are enabled.
