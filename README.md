# mesa-app-demo

Social restaurant & nightlife discovery for Santo Domingo. Phase 1 build.

Start here: read `CLAUDE.md`, then `docs/BUILD_PLAN.md`, then `docs/DESIGN.md`.

Stack: Bun · Hono · PostgreSQL · Drizzle · Better Auth · React + Vite wrapped
with Capacitor (iOS/Android + web) · Cloudinary · MapBox · Railway.
TypeScript strict throughout.

## Local development

Prereqs: Bun and a local PostgreSQL.

```bash
bun install
createdb mesa                                  # local Postgres database

cp packages/db/.env.example packages/db/.env   # set DATABASE_URL
cp apps/api/.env.example    apps/api/.env       # set DATABASE_URL + BETTER_AUTH_SECRET

bun run db:migrate                             # apply the schema
bun run db:seed                                # dense demo cluster + no-N+1 check
bun run api:dev                                # API on :3000  (GET /health)
```

The seed prints a feed read-back that asserts it runs in **one** SQL statement —
the no-N+1 guarantee, checked on every seed. Social login (Apple, Instagram) is
env-gated and off until you add credentials; phone login works in dev and logs
the OTP to the API console.

## Workspaces

- `apps/api` — Hono API (Bun). Auth, typed routes, request-context.
- `apps/app` — React + Vite SPA, wrapped with Capacitor (built out in M2).
- `packages/db` — Drizzle schema (the spine) + the single pooled client, shared
  by the API and, for types only, the app.
