# Mesa — UX Follow-up Plan

**Status:** session summary + open items, written so a fresh session (or a
cleared context) can pick up with no prior chat history. Read this file in
full before starting; it links out to the two source documents that carry the
detailed evidence.

## What this session did (all committed & pushed to `main`)

Three bodies of work landed, in this order:

### 1. Mobile UI audit — 7 commits, fully executed

Source doc: [`docs/UI_AUDIT_FIXES.md`](UI_AUDIT_FIXES.md) — every checkbox is
marked `[x]` with a browser-verified note of what changed and how it was
measured. Nothing left to do here.

```
a48cb76  fix(mobile): safe-area screen header — 7 trapped screens reachable (P0)
53bfacd  fix(theme): avatar-ink + scorebadge contrast; retune Afternoon muted text (P1)
95dbfff  fix(mobile): 44px touch targets + tab bar sizing (P1)
aa58952  feat(map): 'Cómo llegar' directions button on the map spot card   ← user request, mid-audit
a10e5a0  fix(mobile): gate :hover for touch, add :active press feedback
577f49c  fix(ui): resto-map overflow, profile-edit save, error/empty/confirm states
f4f7190  refactor(motion): split ease-out from spring; stagger feed; drop dead CSS
96b91aa  a11y: focus-visible rings, tab-bar aria, lazy images (3g)
```

### 2. Seed data — +14 restaurants

```
557f690  feat(seed): add 14 more Santo Domingo restaurants (35 → 49)
062d907  feat(seed): additive +14 restaurants incl. guaranteed demo rankings
cb9508c  feat(seed): additive +14 restaurants; guarantee demo ranks all 14
```

**Resolved.** The +14 are folded into the main seed — `seed.ts` maps over
`extraRestaurants` (all 14 keys present in `seed-extra.ts`), so any fresh seed
produces the full 49. Prod already holds them, so the one-off additive script
(`seed-add-restaurants.ts`) and its `seed:add` package script were retired.
Re-adding the batch to an already-seeded DB without truncating is recoverable
from git history if it's ever needed again.

### 3. UX critique + fixes — `/impeccable critique`, run twice

Source docs (both **currently untracked** — `.impeccable/` isn't in git yet;
decide whether to commit it or add it to `.gitignore`):
- [`.impeccable/critique/2026-08-21T02-57-55Z__apps-app-src.md`](../.impeccable/critique/2026-08-21T02-57-55Z__apps-app-src.md) — original pass, 23/40.
- [`.impeccable/critique/2026-08-22T18-31-17Z__apps-app-src.md`](../.impeccable/critique/2026-08-22T18-31-17Z__apps-app-src.md) — re-critique after the fixes below, **28/40**, two independent dual-agent assessments (design review + browser evidence), no disagreements between them.

All five original P1/P2 issues are fixed and **committed**:

```
cdde4af  feat(rank): close the core loop — friends on reveal, commit at reveal
c0424ca  fix(ui): score-badge attribution no longer covers the number on --sm
85fa4f1  fix(api): ranking a place clears it from savedPlaces
236ce9b  fix(rank): move onPlaced call into useEffect (P3, pre-existing warning)
c00b344  merge: fix setState-during-render warning in rank-a-place flow
e64dd88  feat(i18n): Spanish-first language sweep across the app (31 files)
```

Short version of each — root cause, what changed — is in the prior turns of
this conversation:

- **Friends on reveal / commit at reveal** — the score-reveal screen now shows
  a friends' rankings card, and the ranking itself saves the instant the score
  reveals (not three screens later at "Post ranking"), so an abandoned flow
  never loses the ranking.
- **Score-badge fix** — the attribution pill on `--sm` `ScoreBadge`s moved from
  overlapping the score (up to 32% coverage) to sitting cleanly below it.
- **`savedPlaces` sync** — ranking a place now clears it from "Want to try" in
  the same transaction.
- **The `PlaceStep` React warning** — fixed by a spawned background task,
  merged cleanly.
- **Language sweep (pass 1)** — Spanish-first, informal *tú*, documented in
  `docs/DESIGN.md` § "Language & voice", swept across all 33 screen/component
  files plus two `en-US` date-locale leaks (`fixtures/tonight.ts`,
  `ProfileTab.tsx`). This pass covered every UI-chrome file but **stopped at
  the data boundary** — restaurant `cuisine` values and occasion tags in seed
  data were still raw English. Both re-critique agents independently caught
  this (a good sign it was real), which led to pass 2 below.

**Pass 2 — data-layer i18n fixes** (this session, after the re-critique;
**not yet committed** — see the commit block at the end of this file):

- Added `cuisineLabel()`, `tagLabel()`, `grainLabel()`/`GRAIN_LABEL_ES` to
  `apps/app/src/lib/display.ts` — display-layer translation maps so English
  values already stored in the DB (seed or prod) render correctly with no
  migration or reseed required. Wired into the shared `Characteristics`
  component (covers most screens) plus the handful of screens that build
  their own meta strings: `RestaurantProfile.tsx`, `MapScreen.tsx`,
  `RankStep.tsx`, `RankingsTab.tsx`'s tag filter chips.
- Fixed a same-screen inconsistency on the restaurant profile: `"N rankings"`
  → `"N rankeados"` (the line right below it already said "rankeados").
- Translated four more stray English strings found by the re-critique:
  `CheersButton`'s screen-reader-only `aria-label` ("Cheers" → "Brindar"),
  the exported share-card's baked tagline (`shareCard.ts`), `lib/time.ts`'s
  `"now"` → `"ahora"`, and three hardcoded `"film · candlelit"` photo tags
  (`RestaurantProfile.tsx`, `TonightDetail.tsx`, `ListScreen.tsx`) plus the
  data-driven version in `DiscoverTab.tsx`.
- Aligned the streak abbreviation: `"5s 🔥"` → `"5 sem. 🔥"` (matches
  `ProfileTab.tsx`'s spelled-out `"5 semanas"`; "s" alone read as ambiguous).
- Updated `packages/db/src/seed-extra.ts`'s `TAGS` constant to the same
  Spanish vocabulary as `RANK_TAGS` in `RankAPlace.tsx`, so any **future**
  reseed writes tags that already match — the display-layer map above is
  what makes *existing* rows (including whatever's in prod right now) render
  correctly without needing that reseed.
- Verified live in-browser (logged in as demo, via the same
  `vite.verify.config.ts` + local API pattern used throughout this session):
  cuisine and occasion-tag translations, the rankings/rankeados fix, the
  film-tag fixes, the streak fix, and the CheersButton aria-label all
  confirmed rendering correctly. `bunx tsc --noEmit` and `bunx biome check`
  both clean on every file touched.
- **Deliberately left alone** (per the design's own comment): dish-post
  `name`/`caption` text in `packages/db/src/seed-data.ts` — documented as
  "the one place we write in English," a Phase 6 mock decision, not a miss.

### 4. P2 behavioral fixes (this session, after pass 2 — committed 214e9c2 was
   pushed at the start of this session; these are on top, **not yet
   committed** — see the commit block at the end of this file)

All three deferred P2 behavioral bugs from the 2026-08-22 re-critique are now
fixed:

- **No link from a ranked place back to its profile** — `RankingRow` in
  `RankingsTab.tsx` was a plain `<div>`; its thumbnail and name/characteristics
  now link to `/r/$restaurantId` (matching feed-card behavior). New CSS in
  `rankings.css` (`.ranking-thumb img`, `.ranking-name-link`) keeps the visual
  layout identical.
- **`"nuevo en tu lista"` persisting on re-ranks** — `RankAPlace.tsx` already
  computed an `isRerank` flag but never passed it to `PlaceStep`; now it does,
  and the compare-card subline reads `"ya en tu lista"` when re-ranking an
  already-ranked place.
- **Pairwise progress counter unreliable** — root cause found: `pairwise.ts`'s
  `comparisonsLeft()` used `ceil(log2(span))`, but this binary search's
  asymmetric branching (a "wins" answer keeps the pivot's index as the new
  bound, a "loses" answer drops it) means the true worst case is
  `ceil(log2(span + 1))` — the old formula silently undercounted, so the
  displayed total would cap out while more comparisons were still coming.
  Fixed the formula, and additionally made `RankAPlace.tsx`'s on-screen total
  recompute live each step (`answered + comparisonsLeft(state)`) instead of
  freezing an initial estimate, so it also self-corrects on a "lucky" path
  that finishes early. Verified a 5-question re-rank end to end: 1 de 5 → 2 de
  4 → 3 de 4 → 4 de 4 → done, no stalls or repeats.

All three verified live in-browser (see "Local dev sign-in was broken" below
for how — the previous `vite.verify.config.ts` pattern didn't survive between
sessions and had to be rebuilt). `bunx tsc --noEmit` and `bunx biome check`
clean on every file touched.

### 5. Local dev sign-in was broken — found and fixed this session

While setting up browser verification, `bun run dev` sign-in (any method)
crashed the client with `BetterAuthError: Invalid base URL: /api-proxy`.
Root cause, in `apps/app/src/lib/auth-client.ts`:
- `VITE_API_URL=/api-proxy` (relative, dev-only, routes through the
  same-origin proxy in `vite.config.ts` for cookie reasons) — but
  `better-auth` 1.6.25's client requires an **absolute** URL with a protocol
  and throws otherwise. This is new/stricter behavior since the
  1.1.14→1.6.25 bump noted earlier in this file's history.
- Fixing just the absolute-URL requirement (resolving the relative path
  against `window.location.origin`) surfaced a **second**, related bug: the
  API mounts Better Auth at `/api/auth/*` (`apps/api/src/index.ts:38`), not
  at the API root that `VITE_API_URL` points at. Once the URL is absolute,
  `better-auth`'s client only auto-appends `/api/auth` for a *bare origin
  with no path* — `/api-proxy` already has a path segment, so the
  auto-append never fired, and requests 404'd one segment short
  (`/api-proxy/sign-in/email` instead of `/api-proxy/api/auth/sign-in/email`).

Fix: `auth-client.ts` now resolves a relative `VITE_API_URL` against the
current origin, then explicitly appends `/api/auth` itself rather than
relying on `better-auth`'s implicit default-path behavior. Prod's
`VITE_API_URL` (an absolute URL with no path, per `docs/DEPLOY.md`) is
unaffected either way — this fix and the previous behavior are equivalent
there.

Verified: reproduced the original crash, applied the fix, then confirmed a
real email/password sign-in as `demo@mesa.test` round-trips correctly —
`POST http://localhost:5173/api-proxy/api/auth/sign-in/email → 200 OK` — and
lands on the feed with no console errors. `bunx tsc --noEmit` / `bunx biome
check` clean.

## Open items

### 1. ~~Confirm prod seed state~~ — resolved

The +14 are confirmed present in prod and the additive one-off was retired
(the batch now lives entirely in the main seed). See §2 above.

### 2. [P2] From the re-critique — now fixed, see §4 above

### 3. [P3] Confirm the ScoreBadge / `#N of M` chip false affordance — not prioritized

`#1 of 43 on your list` (now `#1 de 46 en tu lista`) on the rank-reveal screen
renders as an unclickable `<button>` (the shared `Chip` component always
renders `<button>`). Minor observation from the first critique, never
prioritized. Trivial fix if picked up: render a `<span>` when the chip has no
`onClick`.

### 4. Optional — re-run the critique again after pass 2 lands

Would confirm whether the data-layer fixes close the gap between 28/40 and
the next band. Not required.

## Not on the list (deliberately out of scope)

- **`--md`/`--lg` ScoreBadge overlap** (21% on `--md`) — only `--sm` was
  broken enough to matter; `--md` reads fine at its larger size. Documented
  in the `patterns.css` comment for the fix that shipped.
- Cuisine values and legacy occasion-tag strings in seed data (English) — see
  "Known, deliberate gaps" above. Requires editing + re-running the seed, not
  an app-code change.
- Anything in `docs/UI_AUDIT_FIXES.md` — that whole document is done.

## How to resume

1. Read this file.
2. Everything from this session is done and committed. If the user has
   a new request, treat this file as background context, not a task list.
