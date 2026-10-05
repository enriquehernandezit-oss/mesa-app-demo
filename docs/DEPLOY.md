# Deploying Mesa to Railway

This is the **backend** deploy: the Hono API + a Postgres database. It is now the
project's only deployed service — the app is Expo/React Native and ships through
EAS → TestFlight (see `docs/NATIVE.md`), not from Railway. The API also serves the
public `/p/*` share pages and the seeded catalog art at `/restaurants/*`.

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

| Variable             | Value                                                                                                                                                |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`       | `${{Postgres.DATABASE_URL}}` — reference the Postgres service                                                                                        |
| `NODE_ENV`           | `production`                                                                                                                                         |
| `BETTER_AUTH_SECRET` | a long random string — run `openssl rand -base64 32`                                                                                                 |
| `BETTER_AUTH_URL`    | the API's public URL (see Step 4 — you'll set this after you have the domain)                                                                        |
| `APP_ORIGINS`        | the origin(s) that call the API, comma-separated. With no web app this is mainly the marketing/landing origin; the native app sends no Origin header |

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

Everything below is optional in the sense that the API still boots without it —
the code is env-gated and keeps that feature off — but a real launch wants most
of them. `apps/api/.env.example` has the full list with comments; this is what
each one does and what happens without it.

| Variable                                                                                       | What it does                                                                                       | Without it                                                                                      |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `EMAIL_PROVIDER_API_KEY`, `EMAIL_FROM`                                                         | Resend: verification and password-reset email                                                      | **production refuses to boot without both**; in development the links print to the console      |
| `PHONE_MATCH_SECRET`                                                                           | HMAC key for contacts matching and the opt-in phone number                                         | contacts matching returns no matches and the opt-in number route is off                         |
| `PHONE_OPT_IN`                                                                                 | `on` lets members register their number to be findable                                             | off (it stays off until SMS verification exists)                                                |
| `APPLE_CLIENT_ID`, `APPLE_CLIENT_SECRET`, `APPLE_APP_BUNDLE_ID`                                | Sign in with Apple                                                                                 | the provider is off                                                                             |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CLIENT_ID_IOS`                             | Google sign-in (Web pair, plus the iOS client as an accepted audience)                             | the provider is off                                                                             |
| `GOOGLE_PLACES_API_KEY`                                                                        | search of places not yet in Mesa, and place enrichment                                             | "En Google" results are empty                                                                   |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE_URL` | photo uploads, and erasing a deleted account's photos                                              | uploads report `available: false` and the app falls back; erased accounts' photos are not swept |
| `EXPO_ACCESS_TOKEN`                                                                            | Expo push delivery                                                                                 | pushes are skipped                                                                              |
| `POSTHOG_API_KEY`                                                                              | the API's own error reports                                                                        | no-op                                                                                           |
| `DB_POOL_MAX`                                                                                  | Postgres pool size (default 10)                                                                    | default                                                                                         |
| `PUBLIC_API_URL`                                                                               | this API's own public URL (cover images on share pages, links in emails)                           | falls back to `BETTER_AUTH_URL`                                                                 |
| `PUBLIC_WEB_URL`                                                                               | where "Ábrelo en Mesa" sends someone without the app (landing or App Store page)                   | the button opens the app on that page instead; a warning is logged at boot                      |
| `APPLE_TEAM_ID`                                                                                | turns on `/.well-known/apple-app-site-association` for app links (needs a domain; see FEATURES §8) | the file answers 404                                                                            |
| `INSTAGRAM_*`                                                                                  | a server-side OAuth plugin with no app UI                                                          | nothing changes                                                                                 |

`SMS_PROVIDER_API_KEY` is **not** read: phone sign-in is off outside development
because the code has no SMS sender, so setting the key would change nothing. The
API reads no `MAPBOX_*` variable — Mapbox tokens belong to the mobile build (EAS).

## Step 4 — Get the public URL, then finish auth config

1. API service → **Settings** → **Networking** → **Generate Domain**.
   You'll get something like `https://mesa-api-production.up.railway.app`.
2. Set `BETTER_AUTH_URL` to that exact URL and redeploy.
3. Set `APP_ORIGINS` to any real browser origin that calls the API (the
   marketing/landing site). The native app doesn't need an entry — it isn't a
   browser and sends no Origin header. Real origins only (see the trust-boundary
   note in Step 3). Also set `PUBLIC_API_URL` to the API's own URL, so share-page
   cover images resolve.

### How auth crosses origins (why cookies aren't enough)

The app and the API are on different origins, and a native app has no cookie jar
tied to the API's domain at all. Browsers — iOS Safari especially — also refuse to
store the API's session **cookie** on a cross-site response, so cookie-only auth
hangs on sign-in. Mesa therefore
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
`bun install` → `bun run db:migrate` (applies every Drizzle migration in
`packages/db/drizzle/`, and prunes expired audit, push and throttle rows) → starts the API. Verify it's up:

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

The seed makes the app look alive (40 users, 35 restaurants, 545 rankings) — for
a **local** database. `bun run db:seed` TRUNCATES users and places first, so it
now **refuses to run against anything but localhost** (`packages/db/src/localDatabase.ts`),
and so does `seed:demo` (the demo account has a published password). Production
never gets demo data. The scripts meant for production (`backfill:dishes`,
`user:delete`, `rankings:check`, …) print which database they are about to touch
as their first line; read it for the word `REMOTE` before a real run.

---

## One-time data backfills after a schema migration

Railway's `preDeployCommand` only runs `bun run db:migrate` — a **schema**
migration reaches prod automatically on push. A **data** backfill script does
not; run it yourself, once, against the public `DATABASE_URL`, after its
migration has deployed.

After the "Dish entity foundation" migration (`0015`, adds `dish_categories` +
nullable `dishes.category_id`/`sentiment`) has deployed, run the backfill that
categorizes any pre-existing dish rows and folds old `rankings.favoriteDish`
text into real `dishes` rows:

```bash
DATABASE_URL="postgres://...from railway..." bun run backfill:dishes --dry-run
DATABASE_URL="postgres://...from railway..." bun run backfill:dishes
```

Both are idempotent — a re-run reports 0 created / 0 skipped once done. Only
after the real run's report confirms zero dishes left uncategorized should
migration `0016` (tightens `dishes.category_id` to `NOT NULL`) be generated
and deployed.

---

## Three gotchas to expect

1. **Phone login is off in prod** — there is no SMS sender in the code, so the
   `/phone-number/*` routes are disabled outside development whatever keys are set.
   Everything else runs without it. For a first live smoke test, hitting
   `/health` and the read endpoints is enough.
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

## The retired web frontend service

Mesa used to deploy a second Railway service for the Vite web build. **That app
is gone** (the client is now Expo/React Native). If the project still has that
service, delete it — nothing references it, and leaving it running serves a stale
build of a dead app.

One consequence worth knowing: seeded catalog covers are stored as root-relative
paths (`/restaurants/x.jpg`) that used to resolve against the web origin. The API
serves those files itself now, and `PUBLIC_API_URL` is what share-page cover
images resolve against — set it, or share pages render without a cover.

---

## Production readiness checklist

A first deploy runs fine in a **half-dev mode**: with `NODE_ENV` unset and no
email/SMS providers, the auth code falls back to dev behaviour — OTP codes and
email links are `console.log`'d to the server instead of delivered. Flows return
`200` and _look_ healthy, but no real user ever receives a code or a link. Before
letting anyone but yourself sign in, close the gap in this order:

1. **Wire the email provider first.** Set `EMAIL_PROVIDER_API_KEY` (Resend) and
   `EMAIL_FROM` (a verified sender on your domain, e.g. `Mesa <mail@yourdomain>`;
   the default `onboarding@resend.dev` only delivers to the Resend account
   owner). This makes verification + password-reset emails actually send.
   - `sendMail` is **best-effort by design** — if the key is missing or Resend
     errors, it logs `[email] send failed…` / `[email] NOT SENT…` and returns,
     so a mail outage never 500s signup or reset. Watch the logs for those lines;
     they mean mail isn't going out even though the request succeeded.
2. **Phone login** is not a launch path: the routes are off outside development
   (see the gotcha above). Skip this step.
3. **Then set `NODE_ENV=production`** on the `mesa-api` service. This turns off
   the dev fallbacks (no more secrets/links in logs). Do this step _after_ #1 so
   verification-on-signup has a real sender; the best-effort `sendMail` means a
   missing key won't break signup, but you still want mail actually delivering.
4. **Lock `APP_ORIGINS`** to real deployed origins only — no `localhost`/LAN (see
   Step 3's trust-boundary note).
5. **Custom domain** (for the App Store, and to make the web cookie first-party):
   put the app and API under one registrable domain (`app.` + `api.`). Bearer
   auth works regardless, but a shared root domain also restores same-site
   cookies for the web build.

Env-gated features that stay safely off until you add their keys — the code
simply skips them: `APPLE_*`, `GOOGLE_*` (sign-in), `R2_*` (image upload),
`GOOGLE_PLACES_API_KEY`, `EXPO_ACCESS_TOKEN` (push). See the table in Step 3.

## What is NOT on Railway (Phase 1)

- **The iOS build** — that's EAS Build + the Apple Developer account, tracked in
  `docs/SUBMISSION.md` and `docs/NATIVE.md`. The app talks to this same API over
  Bearer-token auth.
