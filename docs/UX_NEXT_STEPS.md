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

`packages/db/src/seed-add-restaurants.ts` is a standalone, idempotent,
**additive** script (does NOT truncate) — safe to re-run against any DB,
including prod. Run it with:

```bash
DATABASE_URL="<railway public url>" bun run --filter @mesa/db seed:add
```

**⚠️ Open action — confirm this was run against PROD with the final script.**
The user ran an *earlier* version of this script against prod (before the
"demo ranks all 14" guarantee was added in `cb9508c`) and it reported "all 14
restaurants already present — nothing to insert" — meaning it inserted the
restaurants but did **not** yet guarantee the demo account ranks them. The
script was then upgraded (commit `cb9508c`) to also guarantee the demo
account ranks all 14, independent of whether the restaurants already existed.
**There is no confirmation anywhere in this session that the upgraded script
was ever run against prod.** Next session: run
`DATABASE_URL="<prod>" bun run --filter @mesa/db seed:add` against prod and
read the output line — it should say `restaurants: 0 inserted (14/14
present) · N rankings added (demo: N/14 newly ranked) · N notes`. If `N` for
rankings is 0 on a repeat run, that's confirmation it's already applied.

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

## Open items

### 1. Confirm prod seed state — see the ⚠️ above

The one long-standing unresolved item from this whole session. Needs a human
(or a future session with the real credential) to run `seed:add` against prod
and actually read the output line, not just check that it exits 0.

### 2. [P2] From the re-critique, not yet fixed — behavioral, not language

Deliberately deferred (user chose the "data-layer i18n pass" scope this
round, not this one):
- No link from a Rankings-list row back to the restaurant's own profile
  (`RankingRow` in `RankingsTab.tsx:230` is a plain `<div>`).
- Pairwise comparison progress counter is unreliable (observed "2 de 4" →
  "4 de 4" twice in one flow).
- `"nuevo en tu lista"` wrongly persists when re-ranking an already-ranked
  place (factually wrong state shown to the user).

Full detail, suggested fixes, and `/impeccable` commands for each are in the
2026-08-22 critique doc linked above.

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
2. Confirm the prod seed situation (open item above) — ask the user, or just
   run `seed:add` against prod yourself if you're handed the credential, and
   actually read the output line.
3. Everything else from this session is done and committed. If the user has
   a new request, treat this file as background context, not a task list.
