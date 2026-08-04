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
- **Auth:** Better Auth (Instagram OAuth + phone). Nothing else.
- **App:** React + Vite (SPA) wrapped with **Capacitor** for iOS/Android; the
  same Vite build is also the web app. TanStack Query (data/cache) + TanStack
  Router. Native access (contacts, share, push, camera, secure storage) via
  Capacitor plugins.
- **Images:** Cloudinary · **Maps/geo:** MapBox
- **Hosting:** Railway (API + Postgres)
- **iOS delivery:** Vite build → Capacitor → Xcode (fastlane or Ionic Appflow
  for CI) → TestFlight → App Store. (No EAS — that's Expo-only.)
- **Language:** TypeScript everywhere, `strict` on, no `any`

**App Store compliance is a build constraint, not a submission step.** Read
`docs/APPSTORE.md`. Three items are architectural and must be built in early:
Sign in with Apple alongside Instagram (required by 4.8), UGC moderation
(report/block/remove per 1.2), and in-app account deletion (5.1.1).

## Repo shape (Bun workspaces monorepo)

```
mesa-app-demo/
├─ apps/
│  ├─ api/            # Hono API (Bun)
│  └─ app/            # React + Vite SPA, wrapped with Capacitor (iOS/Android + web)
├─ packages/
│  └─ db/             # Drizzle schema + client — SHARED by api and app types
├─ docs/              # BUILD_PLAN.md, DESIGN.md
├─ assets/            # brand/ and moodboard/ references
└─ .claude/           # settings
```

The monorepo exists for **one reason**: the Drizzle schema and its inferred
types live in `packages/db` and are imported by both the API and (for types
only) the app. That is the "typed end to end" guarantee. Keep the
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

Do not invent a look. The brand is fixed and shared with the pre-launch quiz.
Read `docs/DESIGN.md` and use the exact tokens there. The real wordmark is at
`assets/brand/mesa-wordmark-burgundy.png`; the aesthetic references are in
`assets/moodboard/`.
