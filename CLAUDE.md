# Mesa — Project Guide for Claude Code

Read this file in full before writing any code. It is the source of truth for
how this project is built. `docs/BUILD_PLAN.md` is what to build and in what
order. `docs/DESIGN.md` is how it must look and feel. `docs/APPSTORE.md` is the
App Store compliance the build must satisfy.

## What Mesa is

A social restaurant & nightlife discovery app for Santo Domingo, Dominican
Republic. Audience: 22–35, upscale neighborhoods (Piantini, Naco, Bella Vista,
Serrallés, Zona Colonial). The core idea is **social discovery through friends** —
you rank the places you go, you see where your friends rank theirs. Vibe-check
notes, not star ratings. Ever.

**The atomic unit / core loop:** you rank a place you went → you see where your
friends rank theirs. Everything in Phase 1 exists to make that loop work. If a
feature is not load-bearing for that loop, it is not Phase 1.

## Stack (do not substitute without asking)

- **Runtime:** Bun (never npm/node/yarn — use `bun` for everything)
- **Backend API:** Hono (typed, runs on Bun)
- **Database:** PostgreSQL (hosted on Railway)
- **ORM:** Drizzle — schema-first, the schema is the single source of truth
- **Auth:** Better Auth — email + password, phone (OTP), Sign in with Apple, and
  Instagram OAuth. Instagram is optional (a display @handle, set in onboarding),
  never required for membership. (Email+password was added post-Phase-6 by founder
  decision, alongside the original phone/OAuth methods.)
- **App:** **Expo / React Native** (`apps/mobile`), iOS-first. **NativeWind** for
  styling, **Expo Router** for navigation, TanStack Query (data/cache). Native
  access (contacts, location, camera, haptics, secure storage, maps) via Expo
  modules + `@rnmapbox/maps`. There is no web app — the only web surface is the
  API's server-rendered `/p/*` share pages.
- **Images:** Cloudinary · **Maps/geo:** MapBox
- **Hosting:** Railway (API + Postgres)
- **iOS delivery:** **EAS Build** → TestFlight → App Store. Needs the Apple
  Developer account plus two MapBox tokens: the public runtime one
  (`EXPO_PUBLIC_MAPBOX_TOKEN`) and the build-time SDK download token
  (`RNMAPBOX_DOWNLOAD_TOKEN`, injected via `apps/mobile/app.config.js`).
- **Language:** TypeScript everywhere, `strict` on, no `any`

**App Store compliance is a build constraint, not a submission step.** Read
`docs/APPSTORE.md`. Three items are architectural and must be built in early:
Sign in with Apple alongside Instagram (required by 4.8), UGC moderation
(report/block/remove per 1.2), and in-app account deletion (5.1.1).

## Repo shape (Bun workspaces monorepo)

```
mesa-app-demo/
├─ apps/
│  ├─ api/            # Hono API (Bun) — also serves /p/* share pages + catalog art
│  └─ mobile/         # Expo / React Native app (iOS-first). STANDALONE: not a
│                     # workspace member, so Metro gets a flat node_modules
│                     # (see its bunfig.toml linker="hoisted").
├─ packages/
│  └─ db/             # Drizzle schema + client — SHARED by api and app types
├─ docs/              # BUILD_PLAN.md, DESIGN.md
├─ assets/            # brand/ and moodboard/ references
└─ .claude/           # settings
```

The monorepo exists for **one reason**: the Drizzle schema and its inferred
types live in `packages/db` and are imported by the API. That is the "typed end
to end" guarantee. `apps/mobile` keeps its own copy of the API response types
(`src/lib/types.ts`) because Metro cannot resolve workspace packages under Bun's
isolated linker — keep it in sync when the schema changes. Keep the
workspace setup minimal — do not add tooling that isn't earning its place.

## Hard rules (these are non-negotiable — they come from the founder)

1. **Essential complexity only.** No accidental complexity, no speculative
   abstraction, no scaffolding "for later." Build the simplest thing that
   correctly solves the current milestone. If you're tempted to add a layer,
   stop and justify it in one sentence first.
2. **Targeted edits over rewrites.** Change what needs changing. Don't rebuild
   working code to restyle it.
3. **Always prevent N+1 queries.** Use Drizzle relational queries / joins to
   fetch related data in one round trip. Never loop a query.
4. **Always use connection pooling** for Postgres. Configure the pool once in
   `packages/db`; every consumer uses it.
5. **Cache by default** where it's cheap and correct (query results, feeds).
   Use TanStack Query's cache on the client; add a server cache layer only when
   a real hotspot exists — not preemptively.
6. **TypeScript strict, no `any`.** If a type is hard, model it — don't escape it.
7. **Secrets live in env**, never in code or committed files. Provide
   `.env.example` for every app.
8. **Small, conventional commits** (`feat:`, `fix:`, `chore:`…). Do NOT add a
   `Co-Authored-By: Claude` trailer to commits or PRs (already disabled in
   `.claude/settings.json`).

## Milestone discipline

Build **one milestone at a time** (see `docs/BUILD_PLAN.md`). After each
milestone: show how to run/verify it, commit, and stop for review before
starting the next. Do not run ahead into later milestones unprompted.

## Design

Do not invent a look. Read `docs/DESIGN.md` — it is the source of truth. Mesa
ships **two first-class themes**, Afternoon (light paper, default) and Candlelit
(dark oxblood), plus Auto. Both resolve through the **semantic token layer** in
`apps/mobile/src/theme/vars.ts` (the two `--bg`/`--text`/`--accent` maps), mapped
to Tailwind names in `apps/mobile/tailwind.config.js` and consumed as classes
(`bg-bg`, `text-accent`). Never reference a raw brand color or a hex/`rgba()`
outside `vars.ts` and the sites `docs/DESIGN.md` names under "Where color is
allowed to live" — in the native app those are the share card
(`components/ShareCard.tsx`, frozen Candlelit because it leaves the app) and the
ThemePicker swatches (literal previews of each theme). The real wordmark is at
`assets/brand/mesa-wordmark-burgundy.png`; aesthetic references are in
`assets/moodboard/`.
