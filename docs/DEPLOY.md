# Deploying Mesa to Railway

This is the **backend** deploy: the Hono API + a Postgres database. The frontend
(`apps/app`) is **not** deployed here in Phase 1 — it ships inside the native app
via Capacitor, and (optionally) as a free-hosted web build on a static host.

You need a Railway account. No Apple Developer account, no $99 — this is pure
backend and costs only Railway usage (a few dollars/month, often covered by
trial credit for a low-traffic beta).

---

## What you're creating: ONE project, TWO services

```
Railway project "mesa"
├─ Postgres        ← a database service (you add it, you don't build it)
└─ mesa-api        ← your Hono API, built from this GitHub repo
```

The repo already contains a `railway.json` at the root that pins the build,
migrate, and start commands, so the API service mostly configures itself.

---

## Step 1 — Create the project + Postgres

1. Railway dashboard → **New Project**.
2. Inside it → **New** → **Database** → **Add PostgreSQL**.
   Railway provisions it and exposes a `DATABASE_URL` variable on that service.

## Step 2 — Add the API service from GitHub

1. In the same project → **New** → **GitHub Repo** → pick
   `enriquehernandezit-oss/mesa-app-demo`.
2. Open the new service → **Settings**:
   - **Root Directory:** leave it as the repo root (`/`).
     ⚠️ Do **not** set it to `apps/api` — the API imports the `@mesa/db`
     workspace package, which only resolves when `bun install` runs from the
     monorepo root. `railway.json` (at the root) handles the rest.
   - Build / Start / Pre-deploy commands come from `railway.json` automatically
     — you don't type them. (For reference they are:
     build `bun install`, pre-deploy `bun run db:migrate`,
     start `bun run --filter '@mesa/api' start`.)

## Step 3 — Set the API service's environment variables

On the **mesa-api** service → **Variables**, add:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` — reference the Postgres service |
| `NODE_ENV` | `production` |
| `BETTER_AUTH_SECRET` | a long random string — run `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | the API's public URL (see Step 4 — you'll set this after you have the domain) |
| `APP_ORIGINS` | the origin(s) that call the API, comma-separated (your web build's URL and/or `capacitor://localhost`) |

**Do NOT set `PORT`.** Railway injects it and the API already reads
`process.env.PORT`. Setting it yourself will break the bind.

Leave these unset until you actually have the accounts — the code is env-gated
and simply keeps those features off:
`APPLE_*`, `INSTAGRAM_*` (social login), `SMS_PROVIDER_API_KEY`
(phone-OTP login won't work in prod without it), `CLOUDINARY_*`, `MAPBOX_*`.

## Step 4 — Get the public URL, then finish auth config

1. API service → **Settings** → **Networking** → **Generate Domain**.
   You'll get something like `https://mesa-api-production.up.railway.app`.
2. Set `BETTER_AUTH_URL` to that exact URL and redeploy.
3. Set `APP_ORIGINS` to wherever the frontend runs (your Cloudflare Pages /
   Netlify URL for the web build, and/or `capacitor://localhost` for the native
   shell).

## Step 5 — First deploy

Push to `main` (or hit **Deploy**). On each deploy Railway runs, in order:
`bun install` → `bun run db:migrate` (applies Drizzle migrations 0000–0004) →
starts the API. Verify it's up:

```bash
curl https://YOUR-API-URL/health
```

Expected: `{"ok":true,"service":"mesa-api"}`.

`/health` only proves the API process is up — it never touches Postgres, so it
can return `ok:true` even if the database connection is broken. To actually
confirm the DB + migration worked, hit a route that reads data and needs no
login — the public share page for the seeded demo user:

```bash
curl https://YOUR-API-URL/p/u/demo
```

- Branded HTML back → DB connection and migration are both good.
- `{"error":"internal_error"}` (500) → connection/schema problem; check the
  Railway deploy logs for the actual Postgres error.
- `{"error":"not_found"}` (404) → the API is fine, but `bun run db:seed`
  hasn't been run against this database yet (see below).

---

## Seeding the demo data (optional, ONE time only)

The seed makes the app look alive (40 users, 35 restaurants, 545 rankings). But
`bun run db:seed` **TRUNCATES every table first** — only ever run it against a
fresh/empty database, never once real users exist.

To seed the Railway DB once, from your machine (uses the public `DATABASE_URL`
from the Postgres service's Variables tab):

```bash
DATABASE_URL="postgres://...from railway..." bun run db:seed
```

---

## Three gotchas to expect

1. **Phone login won't work in prod** until you add an SMS provider
   (`SMS_PROVIDER_API_KEY`). Everything else runs without it. For a first live
   smoke test, hitting `/health` and the read endpoints is enough.
2. **Cross-origin session cookie.** Once the frontend is on a different domain
   than the API, the session cookie needs `SameSite=None; Secure`. If sign-in
   "works but doesn't stick" in the browser, that's the cause — flag it and
   we'll adjust the Better Auth cookie config for the real frontend origin.
3. **Nixpacks build fails with "Node.js 18.x has reached End-Of-Life and has
   been removed."** Railway's Nixpacks builder auto-detects a Node toolchain
   from `package.json` even though the app runs on Bun, and without a pinned
   version it defaulted to Node 18 — which nixpkgs has since deleted outright.
   Fixed by pinning `"engines": {"node": "22"}` in the root `package.json`
   (already done). If a future build somehow regresses to this error, set
   `NIXPACKS_NODE_VERSION=22` as a service variable to force it regardless of
   any cached build plan.

---

## What is NOT on Railway (Phase 1)

- **The frontend** (`apps/app`) — bundled into the native app via Capacitor. A
  free web version is a separate static deploy (Cloudflare Pages / Netlify),
  pointed at the API via `VITE_API_URL`.
- **Native iOS/Android build** — that's Xcode + (eventually) the Apple Developer
  account, tracked in `docs/SUBMISSION.md`. Deferred until you're ready to put
  it on other people's phones.
