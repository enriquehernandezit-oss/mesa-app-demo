# mesa-app-demo

Social restaurant & nightlife discovery for Santo Domingo. Phase 1 build.

Start here: read `CLAUDE.md`, then `docs/FEATURES.md` (what exists today), then `docs/DESIGN.md`.
`docs/BUILD_PLAN.md` is the original build order, kept as history.

Stack: Bun · Hono · PostgreSQL · Drizzle · Better Auth · Expo / React Native
(`apps/mobile`, iOS-first) · Cloudflare R2 · MapBox · Railway.
TypeScript strict throughout.

## Local development

Prereqs: Bun and a local PostgreSQL.

```bash
bun install
createdb mesa                                  # local Postgres database

cp packages/db/.env.example packages/db/.env   # set DATABASE_URL
cp apps/api/.env.example    apps/api/.env       # set DATABASE_URL + BETTER_AUTH_SECRET

bun run db:migrate                             # apply the schema
bun run db:seed                                # dense demo cluster + no-N+1 check (local databases only)
bun run api:dev                                # API on :3000  (GET /health)
```

The seed prints a feed read-back that asserts it runs in **one** SQL statement —
the no-N+1 guarantee, checked on every seed. The seed (and `seed:demo`) refuse to run
against any database that is not on localhost. Social login (Apple, Google) is
env-gated and off until you add credentials; phone login works in development only
and logs the OTP to the API console.

```bash
bun run test        # the route tests use the local database when DATABASE_URL points at localhost
```

## Workspaces

- `apps/api` — Hono API (Bun). Auth, typed routes, request-context.
- `apps/mobile` — the Expo / React Native app (iOS-first). Standalone — not a workspace member,
  so Metro gets a flat `node_modules`; it has its own `bun install`.
- `packages/db` — Drizzle schema (the spine) + the single pooled client, shared
  by the API and, for types only, the app.
