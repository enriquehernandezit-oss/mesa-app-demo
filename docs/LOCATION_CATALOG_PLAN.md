# Mesa — Location, App-Feel, Heart, and a Real Restaurant Catalog

**Status:** approved plan, execution in progress. Written so a fresh session (or
a cleared context) can pick up with no prior chat history — read this file in
full before touching any of the milestones below, then check the progress
table to see what's actually landed vs. still open.

## Progress

| # | Milestone | Status |
|---|---|---|
| M1 | Swipe, scroll, app-feel | **done** (commit pending push) |
| M2 | Heart replaces 🥂 | **done** (commit pending push) |
| M3 | Real location + Waze/Maps handoff | **done** (commit pending push) |
| M4 | Catalog schema + search rewrite | **done** (commit pending push — see migration note below) |
| M5 | Generated editorial covers | **done** (commit pending push) |
| M6 | Foursquare import | **importer built & verified** (commit pending push) — awaiting Stage A data |
| M7 | Bound map/onboarding/similar for scale | **done & verified** (commit pending push) |
| M8 | Google typeahead gap-filler | **built & verified** (commit pending push) — awaiting founder's `GOOGLE_PLACES_API_KEY` |

Update the status column (`not started` → `in progress` → `done (commit <hash>)`)
as each milestone lands. If a milestone is only partly done, say what's left in
a short note under its row rather than in this table.

---

## Context

Five things, from the founder, in one pass. Four were requested up front; the
fifth is a bug reported mid-session.

1. **"Cerca" doesn't know where you are.** There is **zero geolocation in the
   app** — no `navigator.geolocation`, no Capacitor plugin, nothing. "Cerca"
   ([QuickActions.tsx:37](../apps/app/src/components/QuickActions.tsx:37)) is a
   plain `<Link to="/map">`, and the *other* "Cerca" chip in the rank flow
   ([RankAPlace.tsx:793](../apps/app/src/screens/rank/RankAPlace.tsx:793)) only
   re-sorts by the sector you typed during onboarding. Directions already hand
   off to Google Maps; Waze is nowhere.
2. **It reads as a website, not an app.** A short list of one-line omissions
   (tap-highlight, `user-select`, `touch-action`) plus one real iOS bug: the
   search field is 13px, so **iOS zooms the page on focus and never zooms back**.
3. **🥂 → a heart.** It's the only full-colour thing in an app whose design law
   says brass is the only accent.
4. **Restaurants are added by hand**, two fields deep, and every one lands on the
   same map pin. The founder wants Beli behaviour: search anything, it's there.
5. **The "Listas destacadas" rail drags the page down as you swipe it.**

**Root cause of #5, confirmed by reading the code:** it is *not* the rail's CSS.
[`PullToRefresh.onTouchMove`](../apps/app/src/components/PullToRefresh.tsx:20) reads
**only `clientY`** and never compares horizontal movement. The rail renders
*inside* `<PullToRefresh>` near the top of the feed where `window.scrollY <= 0`,
so a sideways swipe with any downward drift sets `pull` and translates the whole
feed down. `setPull` also re-renders the entire feed subtree on every touchmove —
that's the jank. (The rail *also* lacks the momentum/containment that
`.mesa-chiprail` and `.dish-rail` already have; fix both.)

### Decisions locked with the founder

| | Decision |
|---|---|
| **Map** | Keep Mesa's hand-drawn SVG map. Add **real geolocation** + a Waze / Google Maps / Apple Maps chooser. No Google tiles, no client-side map key. |
| **Catalog** | **Foursquare OS Places** bulk import (Apache-2.0, permanently storable) as the system of record; **Google Places** typeahead only as a live gap-filler. |
| **Photos** | **Generated editorial covers only** for now. No third-party photos. Photo capture deferred. |
| **Heart** | Replaces 🥂 wherever it's a *reaction* (feed button + Activity). Share copy keeps 🥂 (an SVG can't travel in a WhatsApp message). `HeartIcon` currently means "Recomendados para ti" — that gets a new icon. |

### The legal constraint that shapes the whole catalog design

Verified against Google's [Places policies](https://developers.google.com/maps/documentation/places/web-service/policies):
`place_id` is storable **indefinitely**; coordinates only **≤30 days**; names,
photos, hours must be fetched live with Google attribution. Foursquare OS Places
carries no such restriction. **So: nothing Google-derived is ever persisted
except `place_id`.** That single rule removes all TTL/expiry machinery from the
design. Foursquare gives us `fsq_place_id, name, lat/lng, address, locality,
categories, website, tel, instagram, date_closed` — but **no hours and no
photos**, which is why photos must be Mesa's own answer regardless of provider.

---

## M1 — Swipe, scroll, and app-feel  *(no external deps; ship first)*

Run under the **`emil-design-eng`**, **`impeccable`**, and **`ui-ux-pro-max`**
skills, as the founder asked.

**The reported bug:**
- `PullToRefresh` — capture `startX` too; on the first move, if `|dx| > |dy|`,
  abandon the gesture for its duration (set `startY.current = null`). Also
  require a small dead-zone before engaging, add the missing `onTouchCancel`
  (a known gap — an interrupted gesture currently leaves `pull` stuck), and stop
  re-rendering: drive the translate from a ref + direct style write during the
  drag, committing to React state only on release.
- `.rail__scroll` ([feed.css:191](../apps/app/src/screens/tabs/feed.css:191)) —
  add `overscroll-behavior-x: contain`, `-webkit-overflow-scrolling: touch`, and
  `scroll-snap-type: x proximity` with `scroll-snap-align: start` on `.rail-card`.
  Do **not** set `touch-action: pan-x` — it would kill vertical page scrolling
  that starts on the rail.

**The webby tells** (each is small; together they're the whole difference):

| Fix | Where |
|---|---|
| `-webkit-tap-highlight-color: transparent` — set **nowhere** today; the loudest single tell | `global.css` |
| `user-select: none` + `-webkit-touch-callout: none` on controls (only 2 sites have it) | `global.css` |
| `touch-action: manipulation` on interactive elements — kills the 300ms double-tap delay | `global.css` |
| **`.search-field` 13px → 16px** — under 16px iOS zooms on focus and never returns | [feed.css:258](../apps/app/src/screens/tabs/feed.css:258) |
| Momentum on the remaining rails (inconsistent by omission) | `feed.css` |
| `::selection` + `caret-color` → brass (currently OS blue, the only non-brass chrome) | `global.css` |
| Haptics on cheers / rank-stamp / FAB — `@capacitor/haptics` + `navigator.vibrate` fallback | new `lib/haptics.ts` |

**Home-screen correctness:**
- `manifest.webmanifest` — `background_color`/`theme_color` are hardcoded to
  Candlelit oxblood `#210104` while Afternoon is the default theme, so an
  install splash flashes dark for a light-theme user. Add a `maskable` icon
  purpose (Android currently letterboxes the square icon).
- **Add a service worker** (app-shell + static assets precache, network-first for
  API). Today an installed PWA is a dead screen offline. Keep it minimal —
  hand-rolled or `vite-plugin-pwa`; no other new deps.
- `map.css:85` uses raw `env(safe-area-inset-bottom)` instead of `--safe-bottom`.
- Remove the dead `import '../map/map.css'` at
  [DiscoverTab.tsx:27](../apps/app/src/screens/tabs/DiscoverTab.tsx:27).

**Commit:** `fix(ui): axis-locked pull-to-refresh, smooth rails, native touch feel`

---

## M2 — The heart replaces 🥂

- `icons.tsx` — add a **filled** heart variant (`fill="currentColor"`) for the
  active state; the existing stroke `HeartIcon` becomes the inactive state.
- `CheersButton.tsx:50` — `<span className="cheers__glass">🥂</span>` → the icon.
  Keep the bespoke `cheers-pop` spring and the `:active` scale(0.9); retarget the
  keyframe from a rotating glass to a heart *swell* (scale, no rotation — a
  rotating heart reads as a bug). Keep the 450ms CSS/JS pairing in sync.
  Fix the flagged **39px-wide** tap target to ≥44px while here.
- `ActivityScreen.tsx:157` — drop the trailing 🥂 from the sentence.
- **`HeartIcon`'s current meaning must move**: it labels "Recomendados para ti"
  at [ProfileTab.tsx:128](../apps/app/src/screens/tabs/ProfileTab.tsx:128). Give
  that row a new icon (a compass/spark — **not** a star; DESIGN.md forbids stars).
- Share copy keeps 🥂 (4 sites). Also remove the stray 👏 at
  [RankAPlace.tsx:880](../apps/app/src/screens/rank/RankAPlace.tsx:880) — it already
  violates the one-emoji policy.
- Update `docs/DESIGN.md`'s Iconography section: 🥂 is now **share-copy only**.
- Leave the `cheers` table/endpoint names alone — renaming the API buys nothing.

**Commit:** `feat(design): the heart replaces the champagne glass as Mesa's reaction`

---

## M3 — Real location + Waze / Google Maps handoff

- `lib/geo.ts` — `haversineM()`, `formatDistance()` (`"350 m"` / `"1,2 km"`,
  Spanish decimal comma), and `getPosition()` wrapping `navigator.geolocation`
  with a Capacitor Geolocation path when native. Add `@capacitor/geolocation`
  and the `NSLocationWhenInUseUsageDescription` string that `docs/NATIVE.md`
  already documents but no code has ever needed.
- `useMyLocation()` — permission state machine: `idle → prompting → granted |
  denied | unavailable`, cached in `sessionStorage`. **Never auto-prompt on
  load**; prompt on the first tap of "Cerca". On denial, fall back silently to
  today's self-declared-sector sort — the feature degrades, it never blocks.
- **"Cerca" becomes real**: sorts by true distance, shows `"1,2 km"` on rows,
  and the rank flow's nearby chip filters by actual radius instead of a string
  compare on the sector name.
- `/map`: draw a "you are here" marker when a position is known.
- **Navigation chooser** — replace the single "Cómo llegar" link with a small
  action sheet: **Waze** (`https://waze.com/ul?ll={lat},{lng}&navigate=yes` —
  Waze takes coordinates only, no place data), **Google Maps** (existing
  `/maps/dir/?api=1&destination=`), **Apple Maps** (`https://maps.apple.com/?daddr=`).
  Remember the last choice in Preferences. Applies to all 4 directions sites.

**Commit:** `feat(location): real geolocation, distance sort, Waze/Maps handoff`

---

## M4 — Catalog schema + search that survives thousands of rows

Two migrations. **A** (custom SQL) creates `pg_trgm`, `unaccent`, and an
`IMMUTABLE mesa_norm(text)` built on the **two-arg** `unaccent(regdictionary,
text)` — the one-arg form is only `STABLE` and cannot back an index or a
generated column. **B** adds the columns.

`restaurants` gains: `fsqPlaceId` / `googlePlaceId` (partial-unique where not
null), `source` enum (`seed|foursquare|member`), `createdBy`, `sourceRefreshedAt`,
`closedAt`, `removedAt`, `address`, `locality`, `geoPrecision` (`exact|sector`),
and `nameKey` **generated** as `mesa_norm(name)`. `neighborhoods` gains
`lat`/`lng`/`radiusM` centroids (7 rows, backfilled with explicit values).

Migration B must be **hand-edited** after `drizzle-kit generate` — it will emit
`ADD COLUMN ... NOT NULL` for the centroids, which fails on a populated table.
Split into add-nullable → backfill → set-not-null. Then classify existing rows:
the 49 seeded → `source='seed', geo_precision='exact'`; member rows still sitting
on the hardcoded city centre `18.4801,-69.9422` → moved to their sector centroid
with `geo_precision='sector'`.

**No unique constraint on `name`** — chains are real (Pizzarelli has several
Piantini locations). Dedupe is name **+ distance**, in `apps/api/src/lib/placeMatch.ts`,
shared by the importer and `POST /restaurants`:

| # | Rule | Action |
|---|---|---|
| 1 | `fsq_place_id` present | update |
| 2 | normalized name equal **and** ≤250 m | **adopt** (attach id only; keep curated name/coords/cover) |
| 3 | `similarity ≥ 0.55` **and** ≤150 m | **adopt** |
| 4 | else | insert |

**Search rewrite** — `GET /restaurants` currently `GROUP BY`s the whole table
before `LIMIT 30`. Invert it: resolve 30 matching ids first, then join the friend
aggregate onto those 30. Predicates use `mesa_norm` on **both sides** (so
`serralles` matches `Serrallés`) against new GIN trigram indexes. Rank
`prefix-match → similarity → name`, which is what makes it feel Beli-like.
With no query, **browse from `rankings`** rather than scanning the catalog —
4,000 unranked places in alphabetical order is useless. New per-row fields
`address`, `mesaCount`, `isNew` so an unranked place still reads as a listing
("Aún nadie lo ha rankeado · Sé el primero").

`GET /rankings/candidates` becomes query-driven with a limit; delete the
client-side `String.includes` filter at `RankAPlace.tsx:781-801` and fix the
missing cache invalidation at `:259-274`.

**Commit:** two — `feat(db): catalog columns, sector centroids, trigram search infra`
then `feat(search): server-side normalized search, bounded candidates`

---

## M5 — Generated editorial covers

`components/ui/PlaceCover.tsx` — renders the photo when there is one, otherwise
a deterministic generated cover. Seeded by restaurant `id` (survives a rename)
via an FNV-1a hash, same idea as `hueFor` in `Avatar.tsx:9-13`.

Ground `var(--bg-sunk)` (the token DESIGN.md already designates "photo
fallback"); one of ~6 hairline geometries stroked in `--accent` (stroke only —
`--accent` is never a background); a Cormorant serif monogram in `--text`.
**Critically it takes `className="ph"`** so it inherits the existing veil + grain
from `global.css` — generated covers and real photographs must sit in the same
optical layer, or the catalog visibly splits into "real" and "filler".

Collapses the `cover ? <img> : <div/>` pair at **12 call sites** (Explore, Rank
×2, Rankings, Discover, Activity, Map, List ×2, CompareCard, RestaurantProfile
hero). Two need restructuring (`RankStep.tsx:76`, `RestaurantProfile.tsx:314`)
because they set `backgroundImage` on the container. **Not** retrofitted:
`shareCard.ts` and `share-pages.ts` — canvas/server surfaces where `var()`
can't resolve and DESIGN.md freezes Candlelit hex.

**Commit:** `feat(ui): generated editorial place covers`

---

## M6 — Foursquare import  *(the irreversible one — lands on proven ground)*

**Stage A, offline, once:** DuckDB over the Foursquare HuggingFace mirror →
`country='DO'`, `date_closed IS NULL`, Santo Domingo bbox, categories under
`Dining and Drinking` minus a fast-food/food-court blocklist → NDJSON into
`packages/db/data/` (gitignored).

**Stage B:** `packages/db/src/import-foursquare.ts`, following an additive,
idempotent posture — never TRUNCATEs, unlike `seed.ts`.
Loads the whole existing catalog into memory once and buckets it into a spatial
grid, so matching is O(n) in TS with no per-row query (hard rule 3). Writes in
500-row chunks with `ON CONFLICT (fsq_place_id) DO UPDATE ... WHERE source =
'foursquare'` — **the importer only ever rewrites rows it owns**. Never writes
`is_demo`, `cover_image_id`, `price_tier`, `closes_at`. Never deletes: a place
that vanishes from a later extract may already be ranked; it's only ever marked
`closed_at`. `--dry-run` first.

**Guard `bun run db:seed`** in the same commit: `seed.ts:83` is
`TRUNCATE ... restaurants ... CASCADE`, which after the import destroys the
catalog *and every ranking pointing at it*. Refuse to run when imported rows
exist unless `MESA_SEED_FORCE=1`.

**STATUS — Stage B built & verified, Stage A is the founder's to run.**
`foursquare/fsq-os-places` turned out to be a **gated** HF dataset (account +
access-request form + token), so Stage A can't be automated here — it needs the
founder's HF identity. The importer (`import-foursquare.ts`, run via
`bun --filter @mesa/db import:foursquare -- [--dry-run] [--skip-reconcile]`) is
done and was verified end-to-end against local Postgres with fabricated
schema-accurate NDJSON: insert / adopt / cuisine-map (incl. unmapped→null) /
idempotent re-run / closure / reopen / empty-extract abort / `--skip-reconcile`
/ the seed guard all confirmed. One correctness fix worth remembering: the
in-TS `pg_trgm` port had to pad **each word** (2 leading + 1 trailing space) and
union, not pad the whole string — verified byte-identical to Postgres
`similarity()` across 6 real pairs (a whole-string pad silently mis-scores any
repeated word, e.g. "boga boga" vs "boga"). Category **label**-based filtering in
Stage A (not hardcoded ids) because Foursquare's own docs disagree on the current
"Dining and Drinking"/"Fast Food" ids. Runbook for the founder's Stage A steps is
in `~/.claude/plans/` (this session's plan file). Not yet run against production —
that write is the founder's call, like seeding.

**Commit:** `feat(db): Foursquare OS Places importer`

---

## M7 — Bound everything the catalog would break

- **`GET /restaurants/map` is the top risk.** It returns *every* restaurant
  unbounded, and `MapScreen.project()` fits the **bbox of whatever it receives**
  into a fixed viewBox — one imported place near Las Américas rescales the map
  and squashes Piantini to ~20px. Bound it to places with a ranking, saved by me,
  or in an editorial list. Deterministically jitter `geo_precision='sector'` pins
  (hash of id → ±0.0004°) so member-added places fan out instead of stacking.
- `GET /onboarding/candidates` is `ORDER BY name LIMIT 15` — post-import a new
  member's first impression is the 15 alphabetically-first fast-food rows.
  Restrict to editorial-list / demo rows by ranking count.
- `similar` on the restaurant profile has **no `ORDER BY`** — 6 arbitrary
  unknowns post-import.
- **Foursquare has no hours**, so `closes_at` is null across the imported
  catalog and the "Abierto ahora" chip would filter ~99% of it away. Hide the
  chip when results are catalog-heavy.

**Commit:** `fix(api): bound map, onboarding and similar for a real catalog`

---

## M8 — Google typeahead gap-filler  *(last: smallest value, only paid dep)*

`GET /restaurants/search-external?q=` — server-side only.
**`GOOGLE_PLACES_API_KEY` must never be `VITE_`-prefixed**: Vite inlines every
`VITE_*` into the client bundle, and that bundle is the public web app.

Calls Places Autocomplete with a field mask of **`placeId` + `structuredFormat`
only** — which keeps it on the cheapest SKU *and* means we never receive
coordinates at all. Fires only when the debounced query is ≥3 chars **and**
Mesa returned <3 results, with a 5-minute `staleTime` and a per-user rate limit.

Returns a structurally separate `ExternalSuggestion` type (`provider`,
`providerPlaceId`, `name`, `secondaryText`) in its own response key — no `id`,
no `coverImageId`, no scores — so it cannot be rendered through a Mesa code path
by accident.

On pick: dedupe first (by `google_place_id`, then the M4 matcher within 500 m —
without this the typeahead is a duplicate factory), else insert storing
**`place_id` and nothing else Google-derived**: member-confirmed name, chosen
sector, sector centroid coordinates, `geo_precision='sector'`, `source='member'`,
`created_by`. Address/phone/website/hours/photo all null. **No coordinate cache,
therefore no 30-day TTL machinery anywhere.**

Add a per-user daily cap (~10) on `POST /restaurants` — it becomes a catalog
write path, and `created_by` + `removedAt` make bad rows traceable and
removable (App Store 1.2).

**Two items to confirm outside the code:** Google requires a "Powered by Google"
**logo** when their data is shown outside a Google map (Mesa has none), and the
"member-confirmed name" framing is a defensible legal reading, not a mechanical
guarantee.

**Commit:** `feat(search): Google typeahead for places not yet in the catalog`

---

## M9 — Tap a Google result → a real, populated profile *(founder decision, reverses two calls above)*

Tapping a suggestion now calls Google Place Details (`POST
/restaurants/from-google`), populates the row from it, and lands the member
directly on the new profile — instead of opening the sector-picking form. This
reverses **"no coordinate cache, ever"** and **"a place only enters the catalog
by ranking it"**, both stated above: Details' `location` is now stored (exact
`geo_precision`), and a Google tap alone creates the row.

**Founder call on the caching tension**: Google's terms let `place_id` be
stored forever and coordinates for 30 days, but name/address/phone/hours have
no caching exception. Mesa stores them anyway and refreshes every 30 days
(`restaurants.source_refreshed_at`, reused from M6's Foursquare-refresh
column — no new column) — the same pattern every app in this category (Beli
included) uses. Rankings/notes/dishes/lists are Mesa's own data and are never
affected either way.

Dedup order in `POST /restaurants/from-google`: `google_place_id` first (zero
extra Details calls for a repeat tap), then `findExistingMatch` against
Google's real coordinates — a hit **enriches** null columns on the existing
row (a seeded row's curated name/cover/cuisine are never overwritten) rather
than duplicating. Shares the ~10/day cap with `POST /`. `GET /restaurants/:id`
lazily refreshes a stale Google row in the background on view (in-flight
guarded, so concurrent loads never double-call).

Cover: a photoless, exact-geocode, Google-sourced profile gets a Mesa-tinted
MapBox static map as its hero (`PlaceCover`'s new `map` prop) instead of the
generated editorial mark, and the profile's own small locator map is hidden
(one map per profile). Both fall back together when no MapBox token is
configured, so a profile never ends up mapless.

**Commit:** `feat(catalog): tap a Google result to create a full profile`

---

## Critical files

| Area | Files |
|---|---|
| Swipe/app-feel | `components/PullToRefresh.tsx`, `screens/tabs/feed.css`, `styles/global.css`, `public/manifest.webmanifest` |
| Heart | `components/ui/icons.tsx`, `screens/tabs/CheersButton.tsx`, `screens/tabs/ProfileTab.tsx`, `docs/DESIGN.md` |
| Location | new `lib/geo.ts` + `lib/useMyLocation.ts`, `components/QuickActions.tsx`, `screens/map/MapScreen.tsx`, `screens/restaurant/RestaurantProfile.tsx` |
| Catalog | `packages/db/src/schema/{discovery,reference,enums}.ts`, `apps/api/src/routes/restaurants.ts`, new `apps/api/src/lib/placeMatch.ts`, new `packages/db/src/import-foursquare.ts`, `packages/db/src/seed.ts` |
| Covers | new `components/ui/PlaceCover.tsx`, `lib/media.ts` (unchanged, called by it) |

**Reuse, don't rebuild:** `toast()` + `comingSoon()`, `useBack.ts` (the hook
convention `useDebounced`/`useMyLocation` should follow), `EmptyState`,
`UtilityPill`, `cloudinaryUrl`, the `.ph` veil/grain treatment, and
`display.ts`'s `cuisineLabel` vocabulary
(unmapped Foursquare labels must fall back to `null`, or English category strings
leak into the Spanish UI).

---

## Verification

Per milestone: `bunx tsc --noEmit -p apps/app/tsconfig.json`, `bunx biome check`,
and DESIGN.md's raw-colour grep → 0. Browser harness: local API on `:3222` +
plain-HTTP Vite on `:5173` (prod `APP_ORIGINS` correctly rejects localhost), both
themes, 375px + 1280px.

- **M1** — scripted touch sequence: a horizontal swipe on the rail must leave
  `window.scrollY` and the feed's transform unchanged; a vertical drag from the
  top must still pull. Assert computed `font-size` on `.search-field` ≥16px.
  Offline test: kill the server, reload the installed PWA, confirm a shell.
  **Then confirm on the founder's iPhone** — this milestone is entirely about
  what the hand feels, and no headless check substitutes.
- **M2** — both themes; verify tap target ≥44×44; screenshot the pop mid-flight;
  confirm zero 🥂 left in rendered UI and exactly 4 in share strings.
- **M3** — permission grant/deny/unavailable all exercised; each of the three
  nav URLs opened on device; confirm denial silently falls back.
- **M4/M6** — `--dry-run` reviewed before any write; `EXPLAIN ANALYZE` the new
  search proving GIN index usage; `serralles`→`Serrallés` matches; re-run the
  importer and assert **zero** inserts/updates (idempotency); confirm a seeded
  row keeps its name, coords, and cover after adoption.
- **M7** — `/map` with the full catalog: assert the viewBox still frames the
  target sectors and pin count stays bounded.
- **M8** — key absent from the client bundle (`grep` the built JS); a picked
  suggestion creates exactly one row; picking a place already in the catalog
  returns the existing row, not a twin.

## Not doing

No Google Maps tiles (founder's call). No third-party photos or photo capture
(deferred). No PostGIS — haversine in TS is enough for one city. ~~No
coordinate caching from Google, ever~~ — reversed by founder decision in M9:
coordinates (and the other Details fields) are now cached with a 30-day
refresh. No renaming the `cheers` table. No `catalog-reconcile` pass to promote
sector pins to street pins — noted as a later option only. No Google Photos
(M9) — a separate, pricier SKU with no caching exception at all; the map cover
is the answer to "what's the picture" for a photoless Google place.
