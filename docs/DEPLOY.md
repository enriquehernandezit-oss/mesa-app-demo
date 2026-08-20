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
| `APP_ORIGINS` | the origin(s) that call the API, comma-separated (the deployed web app's URL and/or `capacitor://localhost`) |

**`APP_ORIGINS` is a production trust boundary — put ONLY real deployed origins
here.** It feeds both the CORS allowlist and Better Auth's `trustedOrigins`, so
every origin listed is one the live API will accept credentialed, state-changing
requests from. Never add `http://localhost:*` or a LAN IP (`http://192.168.x.x`)
to the **production** service — that trusts anyone's laptop. For local phone
testing, run the API locally instead (its code default is `http://localhost:5173`),
or stand up a **separate** staging service with the dev origins — never widen
prod. No spaces around the commas: Better Auth matches origins exactly, so a
stray space makes the origin silently fail (`403 INVALID_ORIGIN`).

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
3. Set `APP_ORIGINS` to wherever the frontend runs — the deployed web app's URL
   and/or `capacitor://localhost` for the native shell. Real origins only (see
   the trust-boundary note in Step 3).

### How auth crosses origins (why cookies aren't enough)

The web app and the API are on different origins (different Railway subdomains,
and in the native app the shell runs from `capacitor://localhost`). Browsers —
iOS Safari especially — refuse to store the API's session **cookie** on a
cross-site response, so cookie-only auth hangs on sign-in. Mesa therefore
authenticates cross-origin with a **Bearer token**: on sign-in the API returns
the session token in a `set-auth-token` header (exposed via CORS), the app
stores it and sends `Authorization: Bearer <token>` on every request. The
cookie stays `SameSite=Lax` (Better Auth's default) and is only used for
first-party/same-origin web — a header is never auto-attached cross-site, so
this also keeps CSRF off our own state-changing routes. Nothing to configure;
it's wired in `apps/api/src/auth.ts` (the `bearer()` plugin) and the app's
`src/lib/auth-token.ts`.

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
2. **Cross-origin auth "works but doesn't stick."** If sign-in hangs — most
   visibly on an iPhone — it's the browser refusing the cross-site session
   cookie. This is already solved by Bearer-token auth (see "How auth crosses
   origins" in Step 4); the fix is NOT to reintroduce `SameSite=None`. If it
   recurs, check that the API emits `set-auth-token` and exposes it via CORS,
   and that the app is sending `Authorization: Bearer`.
3. **Nixpacks build fails with "Node.js 18.x has reached End-Of-Life and has
   been removed."** Railway's Nixpacks builder auto-detects a Node toolchain
   from `package.json` even though the app runs on Bun, and without a pinned
   version it defaulted to Node 18 — which nixpkgs has since deleted outright.
   Fixed by pinning `"engines": {"node": "22"}` in the root `package.json`
   (already done). If a future build somehow regresses to this error, set
   `NIXPACKS_NODE_VERSION=22` as a service variable to force it regardless of
   any cached build plan.

---

## The web frontend service (`@mesa/app`)

The Vite web build is deployed as a **second Railway service** in the same
project, served as static files. It shares the monorepo, so it needs its own
config to avoid inheriting the API's `railway.json`:

- **Root Directory:** repo root (`/`) — NOT `apps/app`. `bun install` must run
  from the root so the `@mesa/db` workspace resolves (same reason as the API).
- **Config file:** point Config-as-code at **`/apps/app/railway.json`** (in the
  service's Settings → Config-as-code). That file sets the build
  (`bun install && bun run --filter '@mesa/app' build`) and start
  (`bunx serve -s apps/app/dist -l $PORT`) commands and, crucially, has **no**
  `preDeployCommand` — the DB migration belongs only to the API.
- **`VITE_API_URL`:** the API's public URL. Vite **inlines this at build time**,
  so changing it requires a rebuild, not just a restart — and a stale value
  (e.g. `http://localhost:*`) ships a build that calls a URL that doesn't exist.

Symptom if this is misconfigured: visiting the app URL returns the API's
`{"error":"not_found"}` JSON instead of HTML — that means the service is running
the API's start command, i.e. it's still on the shared root `railway.json`.

---

## Production readiness checklist

A first deploy runs fine in a **half-dev mode**: with `NODE_ENV` unset and no
email/SMS providers, the auth code falls back to dev behaviour — OTP codes and
email links are `console.log`'d to the server instead of delivered. Flows return
`200` and *look* healthy, but no real user ever receives a code or a link. Before
letting anyone but yourself sign in, close the gap in this order:

1. **Wire the email provider first.** Set `EMAIL_PROVIDER_API_KEY` (Resend) and
   `EMAIL_FROM` (a verified sender on your domain, e.g. `Mesa <mail@yourdomain>`;
   the default `onboarding@resend.dev` only delivers to the Resend account
   owner). This makes verification + password-reset emails actually send.
   - `sendMail` is **best-effort by design** — if the key is missing or Resend
     errors, it logs `[email] send failed…` / `[email] NOT SENT…` and returns,
     so a mail outage never 500s signup or reset. Watch the logs for those lines;
     they mean mail isn't going out even though the request succeeded.
2. **Wire the SMS provider** if you want phone login: `SMS_PROVIDER_API_KEY`.
   Until it's set, phone `send-otp` returns `200` but only logs the code — it is
   not a working login path for real users.
3. **Then set `NODE_ENV=production`** on the `mesa-api` service. This turns off
   the dev fallbacks (no more secrets/links in logs). Do this step *after* #1 so
   verification-on-signup has a real sender; the best-effort `sendMail` means a
   missing key won't break signup, but you still want mail actually delivering.
4. **Lock `APP_ORIGINS`** to real deployed origins only — no `localhost`/LAN (see
   Step 3's trust-boundary note).
5. **Custom domain** (for the App Store, and to make the web cookie first-party):
   put the app and API under one registrable domain (`app.` + `api.`). Bearer
   auth works regardless, but a shared root domain also restores same-site
   cookies for the web build.

Env-gated features that stay safely off until you add their keys — the code
simply skips them: `APPLE_*`, `INSTAGRAM_*` (social login), `CLOUDINARY_*`
(image upload), `MAPBOX_*` (maps).

## What is NOT on Railway (Phase 1)

- **Native iOS/Android build** — that's Xcode + (eventually) the Apple Developer
  account, tracked in `docs/SUBMISSION.md`. Deferred until you're ready to put
  it on other people's phones. (The web `@mesa/app` service above is separate
  from the native build; the native app bundles the same Vite output via
  Capacitor and talks to the same API over Bearer-token auth.)
