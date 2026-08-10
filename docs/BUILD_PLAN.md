# Mesa — Build Plan

This is the roadmap. Phase 1 is broken into milestones you build one at a time,
in order. Phases 2 and 3 are outlined so the schema and structure don't fight
them later, but **do not build Phase 2/3 work now.**

Guiding constraint everywhere: the **core loop** is _rank a place → see where
friends rank theirs_. Cold-start (an empty feed on first open) is the #1 product
risk, so onboarding and seeding are treated as first-class, not afterthoughts.

---

## PHASE 1 — The ranking passport (ships to TestFlight → public launch)

Everything needed for the core loop to feel alive on day one, and nothing else.
No payments. Reservations are a handoff, not an engine (see Milestone 5).

### Milestone 0 — Repo & tooling foundation
- Initialize Bun workspaces monorepo per the shape in `CLAUDE.md`.
- `apps/api`, `apps/app` (React + Vite), `packages/db` with workspace wiring.
- Root config: TypeScript strict base config, shared lint/format, `.gitignore`,
  `.env.example` files.
- Verify: `bun install` clean, workspaces resolve, `bun run` scripts exist.
- Commit. Stop.

### Milestone 1 — Backend foundation (API + DB + auth + seed)
Build the whole shared spine before any screen exists.
- **DB (`packages/db`):** Drizzle + Postgres client with **connection pooling**
  configured once and exported. Schema v1 (see "Schema v1" below). Migrations
  via drizzle-kit.
- **API (`apps/api`):** Hono app, health route, typed route structure, error
  handling, request-context (current user).
- **Auth:** Better Auth wired to Postgres — phone/email + Instagram OAuth **and
  Sign in with Apple** (required by App Store 4.8 the moment Instagram login
  exists — build all providers together, not later), session middleware
  protecting authed routes.
- **Seed script:** insert a **dense demo cluster** — ~8 fake friends who already
  follow each other, ~15 Santo Domingo restaurants across the target
  neighborhoods, and rankings + vibe notes for each friend. This is what makes
  the demo feed full instead of empty. Also import any `waitlist` rows shape
  from the quiz so the table exists.
- Deploy API + Postgres to Railway; confirm health route live.
- Verify: can sign in, hit an authed route, seed populates, no N+1 in the seed
  read-back. Commit. **Stop for review — do not start the app yet.**

### Milestone 2 — App shell + auth + onboarding
- Scaffold React + Vite app, TanStack Router + TanStack Query provider, Better
  Auth client. **Initialize Capacitor** (iOS + Android platforms) and confirm a
  device build boots the Vite app in the native shell.
- Load fonts (Cormorant Garamond + Plus Jakarta Sans) and apply the theme tokens
  from `docs/DESIGN.md`. Build the shared UI primitives (text styles, buttons,
  cards, chips) against those tokens once. **(Phase 6 supersedes the single-theme
  token instruction: the app now ships Afternoon + Candlelit through the semantic
  token layer — see `docs/DESIGN.md`. Reference `--bg`/`--text`/`--accent`, never
  raw brand colors.)**
- Auth flow: sign in with **Instagram, Apple, or phone** (Apple option is not
  optional — see 4.8).
- Contact import uses the Capacitor Contacts plugin with a proper
  `NSContactsUsageDescription` purpose string and a just-in-time permission
  prompt (App Store 5.1). Never request contacts at launch.
- **Onboarding (cold-start fix, do not skip):**
  1. Rank an initial 5–10 spots via the pairwise flow (Milestone 3 mechanic).
  2. Friend-find: Instagram connections + contact import (Capacitor Contacts).
  A new profile is never empty and never friendless on first real open.
- Tab shell: Discover · Rankings · Tonight · Profile.
- Verify in the browser (Vite dev server) and on device via a Capacitor dev
  build in the iOS Simulator. Commit. Stop.

### Milestone 3 — The ranking loop (the atomic unit)
- **Rank a place:** pairwise comparison flow ("Vela or Lumbre?") that inserts a
  new place into the user's ordered list and derives a score. No stars anywhere.
- **Rankings screen:** the personal ordered list, serif rank numerals, score,
  neighborhood. Mine / Want-to-try tabs.
- **Vibe note:** one short line of "why" attached to a ranking. This is Mesa's
  identity (vibe-check, not rating) — cheap and load-bearing, so it's in v1.
- **UGC moderation hooks (App Store 1.2 — vibe notes are user content):** when
  the `vibe_notes` table lands, add the moderation primitives with it — a
  `reports` table + report action, user block, and content-removal/eject
  capability, plus a EULA acceptance on signup. Apple rejects UGC apps without
  these. Keep it minimal but present.
- Verify the loop end to end: rank → list updates → note saves; report/block
  work. Commit. Stop.

### Milestone 4 — Social graph + discovery
- Follow / followers; friend-find surfaced in-app.
- **Discovery feed:** what your friends ranked and their vibe notes — the payoff
  of the loop. Feed queries must be single-round-trip (no N+1), cached client-side.
- **Restaurant profile:** info, who-ranked-it, friends' notes, save / want-to-try.
- Verify feed is full using the seed cluster. Commit. Stop.

### Milestone 5 — Reserve handoff + polish + TestFlight
- **Reserve = handoff, not engine:** "Request a table" opens a WhatsApp deep
  link / call to the restaurant with prefilled day, time, party size. Do NOT
  build a booking backend — DR restaurants have no supply behind it yet (that's
  Phase 3). This is honest scope, not a shortcut.
- Cloudinary image pipeline for restaurant/profile photos; MapBox map on the
  restaurant profile.
- **In-app account deletion** in profile settings (App Store 5.1.1 — required).
- Empty states, loading skeletons, error states, offline-tolerant caching.
- **App Store submission pass** (see `docs/APPSTORE.md`): privacy nutrition
  label, all purpose strings, privacy policy + terms URLs, confirm the app has
  real native functionality beyond a WebView (4.2 — contacts/push/share/maps
  satisfy this).
- Vite build → Capacitor → TestFlight (via Xcode/fastlane or Ionic Appflow).
  Seed the beta with ONE dense real friend cluster, not scattered testers
  (cold-start again).
- Commit, tag `v0.1.0-beta`.

### Schema v1 (the spine — implement in `packages/db`)
Core tables (Claude Code fills columns/indexes; these are the entities and the
relationships that must exist):
- `users` — profile, handle, neighborhood, avatar.
- `follows` — follower_id → following_id (the social graph).
- `neighborhoods` — the target zones (reference/enum-like).
- `restaurants` — name, neighborhood_id, cuisine, geo (lat/lng for MapBox),
  cover image (Cloudinary id).
- `rankings` — user_id → restaurant_id, ordered position + derived score
  (supports the pairwise mechanic). One user's ordered list.
- `vibe_notes` — user_id → restaurant_id, one line of text.
- `saved_places` — user_id → restaurant_id (want-to-try list).
- `reports` — reporter_id → target (note/user), reason, status (UGC moderation).
- `user_blocks` — blocker_id → blocked_id (required for UGC apps).
- `waitlist` — mirrors the quiz's waitlist so quiz-takers are known users.

Auth accounts (managed by Better Auth) must support Instagram, Apple, and phone
identities on one user, and account deletion must cascade correctly.

Keep module boundaries clean (social vs. discovery vs. ranking) so Phase 2/3 are
additive. Do **not** build a super-app / sub-app architecture now — that's
accidental complexity at zero users.

---

## PHASE 2 — Reasons to reopen it (post-launch, NOT NOW)
- Group plans with voting (pick-the-spot).
- Wishlist-match nudges ("you both saved Vela — tírale un Mesa"). The organic,
  validated replacement for stranger-invites.
- Nightlife crowd-voting, real-time, resets 6 AM (the "relevant every night"
  engine).
- Curated creator / ambassador lists.
- Events / tastings + ticketing (first real monetization + UGC engine).

## PHASE 3 — Moat, money, expansion (2–3 yr horizon, NOT NOW)
- B2B reservation management for restaurants (the real infrastructure play and
  genuine DR first-mover gap).
- Private dinner invites (mutual-follow, neutral framing); maybe dining-with-
  strangers — deferred past year 3 per validation.
- Expansion: Santiago → Punta Cana → LatAm (Android is already a build target).

---

## Definition of done for Phase 1
A user can: sign in, be onboarded with a starting ranking + friends, rank places
via pairwise comparison with vibe notes, follow people, open a feed that is full
of friends' rankings, view a restaurant, save it, and request a table via
handoff — all in the fixed Mesa brand, shipped to TestFlight, with pooling +
no-N+1 + caching in place from the first commit, and App Store guidelines
satisfied (Sign in with Apple, UGC report/block/remove, in-app account deletion,
privacy strings + labels) — see `docs/APPSTORE.md`.
