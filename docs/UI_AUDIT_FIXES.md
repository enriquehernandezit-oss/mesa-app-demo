# Mesa — Mobile UI Audit & Fix Plan

**Status:** approved backlog, not yet executed.
**Context:** Findings from a deep mobile UI audit (impeccable + Emil Kowalski lenses,
plus live browser verification and two full static passes). Every finding below was
**verified**, not speculated. This file is self-contained — a fresh session can execute
it with no prior chat context.

---

## What the app is (read before touching anything)

- React + Vite SPA in `apps/app`, wrapped with Capacitor → ships as an **iOS/Android
  native app** and as a **PWA installed to the iOS home screen**. Both run in
  **standalone mode**, where content renders **under the ~59px iOS status bar**.
- Two first-class themes, both must pass: **Afternoon** (light paper, `:root`, the
  **default**) and **Candlelit** (dark oxblood, `html[data-theme="candlelit"]`).
- Design tokens are the law: `apps/app/src/styles/tokens.css`. Never hardcode color
  outside that file (see `CLAUDE.md` / `docs/DESIGN.md`). Safe-area tokens exist:
  `--safe-top: env(safe-area-inset-top, 0px)` and `--safe-bottom` (tokens.css:132-133).
- Deployed web build: `https://mesaapp-production.up.railway.app` (Railway `@mesa/app`
  service, auto-rebuilds on push to `main`). Auth is Bearer-token; demo login
  `demo@mesa.test` / `mesademo2026`.

## How to verify safe-area fixes in a desktop browser

`env(safe-area-inset-*)` is `0` in a normal browser, so the bug is invisible there.
To reproduce the iPhone, inject an override on the deployed (or local dev) page, then
navigate the SPA and screenshot:

```js
// In the browser console / javascript_tool against the running app:
let s = document.getElementById('sim-safe') || document.head.appendChild(
  Object.assign(document.createElement('style'), { id: 'sim-safe' }));
s.textContent = ':root{--safe-top:59px !important;--safe-bottom:34px !important;}';
```

A back control is unreachable if its rendered `getBoundingClientRect().top < 59`.
Use mobile viewport 375×812.

## Keep these — they are already right (do not "fix")

- Token discipline: 1 stray `rgba()` in all CSS outside tokens.css. Keep it that way.
- Global `prefers-reduced-motion` reset (`styles/global.css:81`) covering all motion.
- No `scale(0)` entrances anywhere; no `ease-in` on UI. Entrances start from
  `translateY(...)`. Preserve this.
- `overscroll-behavior: none` on body (no rubber-band white flash). Keep.
- The design language itself (oxblood/candlelit, real serif wordmark, film-grain
  photos, mono micro-labels, brass numerals) is distinctive and non-generic. **Do not
  restyle it.** Every fix below is an implementation correction, not a redesign.

---

# PASS 1 — P0: 7 screens are dead ends in standalone mode

**Impact:** blocks the user. On an installed iPhone app, these 7 screens have **no
reachable way out** — the only exit control renders at ~31px, buried under the 59px
status bar, and there is no tab bar on them either. Browser-verified: `top:31px`,
`reachableExits: 0`.

**Root cause:** Only 4 routes (`/discover`, `/rankings`, `/tonight`, `/profile`) are
under `TabsLayout` (`apps/app/src/app/router.tsx:107-118`), which renders `<TopBar/>`
(supplies `--safe-top`) and `<TabBar/>`. The other 13 routes are under `rootRoute`.
Seven of them render their **own** `.tab-shell` with no TopBar, and `.tab-body`
(`screens/tabs/tabs.css:12`) pads only `var(--space-4)` = 16px on top, with **no
`--safe-top`**. So the back button sits at 16px + its own offset ≈ 31px.

**The 7 trapped screens** (each renders `<div className="tab-shell">` with a
`.link-action` back button and no `<TopBar/>`):

- [x] `screens/settings/SettingsScreen.tsx:119` — "‹ Settings"
- [x] `screens/activity/ActivityScreen.tsx:73` — "‹ Activity" (+ `:80` "Mark read")
- [x] `screens/user/UserRankings.tsx:65` — "‹ Back" (+ `:99` `.user-menu-btn`)
- [x] `screens/leaderboard/LeaderboardScreen.tsx:32` — "← Back"
- [x] `screens/explore/ExploreScreen.tsx:64` — "← Back"
- [x] `screens/map/MapScreen.tsx:94` — "← Back"
- [x] `screens/list/ListScreen.tsx:28` — "← Back"

**DONE (this session):** New `components/ScreenHeader.tsx` + `screen-header.css`
replaces the inline `.link-action` back button on all 7 screens; it owns
`--safe-top` (negative margins cancel `.tab-body`'s top padding so the inset is
not double-counted) and gives the back control a 44px hit area. Added
`--ease-out` to `tokens.css` (used for the header's `:active`). Removed the now
orphaned `.user-headbar` / `.activity-head` rules. **Browser-verified** at 375px
with `--safe-top:59px`: all 7 back controls render at `top:79`, box `44px` tall
(Settings, Leaderboard, Explore, Map, Activity[+Mark read@95], List,
User[success: name + ⋯ menu@83; error: "Back"]). ⋯ menu still opens (Report/Block).

**Fix (recommended):** create one shared header component so this can't drift again.

- New `components/ScreenHeader.tsx` + CSS: a sticky/normal header with
  `padding-top: calc(var(--safe-top) + var(--space-3))`, a back button that is a
  **≥44×44px** tap target (visual glyph can stay small; expand the hit area with
  padding or a `::before`), an optional title, and an optional right-side action slot
  (for Activity's "Mark read", UserRankings' "⋯").
- Replace the inline `.link-action` back buttons on all 7 screens with `<ScreenHeader>`.
- Do **not** blanket-add `--safe-top` to `.tab-body` — the 4 real tab screens already
  get the inset from `<TopBar/>`, so that would double-pad them.

**Verify:** with the sim snippet applied, navigate to each of the 7 routes at 375px;
confirm the back control's `top ≥ 59` and its box is ≥44×44. Screenshot `/settings`
and `/leaderboard` before/after.

---

# PASS 2 — P1: broken theme tokens + default-theme contrast

## 2a. `--avatar-ink` is theme-invariant but its backdrops are not

`--avatar-ink: #fdf7ec` (tokens.css:73, "both themes") is cream. It breaks in **both**
themes, in opposite places:

- **Avatar initials, Afternoon:** `.mesa-avatar--initial` gradient
  (`components/ui/ui.css:136`) ends at `--bg-sunk`, which is **light** (#e7dccb) in
  Afternoon → cream initials on cream. Measured **1.27–2.03:1**.
- **`.scorebadge__badge`, Candlelit:** `background: var(--text)` (#ebe4d6 cream) with
  `color: var(--avatar-ink)` (cream) → **1.19:1** (`components/ui/patterns.css:90-100`).

**Fix:**
- [x] Make `--avatar-ink` **theme-specific**: keep cream in Candlelit; use a dark
  ink-brown in Afternoon. Verify the chosen ink hits **≥4.5:1** (small text) against the
  gradient **midpoint** (hue mixed 50/50 with `--bg-sunk`) in *both* themes. Gradient
  hues: `--avatar-hue-1/2/3` = #b5773c / #c8703f / #a98a63.
- [x] `.scorebadge__badge`: give it a foreground that contrasts with its `var(--text)`
  background (e.g. a dark token like `--bg`/`--on-accent`), verified ≥4.5:1 in both
  themes. Also bump its `font-size: 7px` → ≥10px (see Pass 3 text sizing).

**DONE (this session):** `--avatar-ink` → `#2a1512` (dark ink) in `:root`, cream
override in the Candlelit block. `.scorebadge__badge` → `color: var(--on-accent)`
(always the counterpart of its `var(--text)` bg) + `font-size: 10px`. **Browser-
verified** both themes: avatar ink vs gradient midpoints **Afternoon 7.99–8.52:1**,
**Candlelit 7.66–8.35:1** (was ~1.7); scorebadge **Afternoon 16.2:1 / Candlelit
15.5:1** (was 1.19).

## 2b. Afternoon (the default theme) fails contrast widely

`:root` is Afternoon, so light-mode users get the weaker experience. Failing text
(normal text needs 4.5:1; measured on the deployed app):

- [x] `.lb-meta` 9px → **2.66:1** (×82) — `screens/leaderboard/*`
- [x] `.link-action` 11px → **2.66:1** (×60)
- [x] `.feed-time` 11px → **3.00:1** (×20)
- [x] `.cheers__glass` / `.cheers__count` 13px → **3.00:1**
- [x] `.chars__line` 11.5px → **2.66–3.00:1**
- [x] `.ranking-score` 16px → 4.11:1 (just under)

**Fix:** retune the Afternoon (`:root`) muted text tokens (`--text-muted`,
`--text-faint`, and whatever `.lb-meta`/`.link-action`/`.feed-time` resolve to) so body
text hits **≥4.5:1** on its actual background. Do **not** touch Candlelit values (they
mostly pass — only the badge above fails there). Re-verify both themes after.

**DONE (this session):** the failing classes all resolve to `--text-muted`, so
the single lever was `--text-muted` `#a2917f` → `#746253` (`:root` only).
`.ranking-score` uses `--accent`, switched to `--accent-strong` (the "brass on
small text" token). `--text-faint` has **no CSS consumers** (dead token), left
as-is. **Browser-verified Afternoon** on real elements: lb-meta 5.08 (on paper),
feed-time 5.72, link-action 5.08, cheers 5.72, chars--muted 5.72, ranking-score
5.13 — all ≥4.5. Candlelit `--text-muted` untouched (feed-time still 5.1).

---

# PASS 3 — P1/P2: touch targets, hover, motion, discrete bugs

## 3a. Touch targets (58% of controls fail 44×44)

Measured live across 8 routes: **330 interactive elements, 191 fail** WCAG 2.5.5
(44×44). Large content rows pass; **every small control fails**. Fix each to ≥44×44 —
for controls that must stay visually small (map pins, badges, icon buttons), expand the
**hit area** (padding / invisible `::before`) without enlarging the glyph.

- [x] `.tab-link` 79×**31** — grow `.tab-bar` (`screens/tabs/tabs.css:47`) so links are
  ≥44 tall: `align-items: stretch`, raise min-height (~49pt + `--safe-bottom`), bump
  label `font-size: 8.5px` → 11px, icons 16px → ~22-24px.
- [x] `.link-action` 53×**28** (the back buttons, `screens/tabs/rankings.css:209`,
  `padding:0`) — subsumed by the ScreenHeader in Pass 1 where it's a back control;
  elsewhere give it a 44px tap height.
- [x] `.topbar__btn` 38×38 → 44 (`components/topbar.css:34`)
- [x] `.tab-fab` 40×40 → 44 (`screens/tabs/tabs.css:82`)
- [x] `.cheers` 53×**28** (`screens/tabs/feed.css:142`) — core interaction
- [x] `.mesa-chip` 40×**26** / `.mesa-chip--sm` ~25 (`components/ui/ui.css:181,206`)
- [x] `.upill` ~32 tall (`components/ui/patterns.css:118`)
- [x] `.map-pin` **5–12px** hit area (`screens/map/map.css:37`) — expand hit area only
- [x] `.mesa-toggle` 42×25 (`components/ui/ui.css:281`)
- [x] `.compare__same` ~27 (`screens/rank/rank.css:62`), `.rank-skip` ~12
  (`rank.css:92`), `.dish-head__camera` ~12 (`screens/dish/dish.css:9`),
  `.friend-follow` ~34 (`screens/onboarding/friends.css:38`), `.dish-name-input` /
  `.dish-caption-input` 21-26 (`dish.css:109,130`)
- [x] `<input type="checkbox">` UA default (`screens/onboarding/ProfileStep.tsx:112`) —
  gates onboarding submit; make it a ≥44px labelled control
- [x] `.resto-back` 40×40 → 44 (`screens/restaurant/restaurant.css:115`),
  `.resto-condensed__back` ~22 (`restaurant.css:34`), `.resto-time` / `.resto-savecheck`
  / `.resto-rankagain` / `.resto-seeall` (restaurant.css), `.tonight-join`
  (`screens/tonight/tonight.css:102`), `.share-pill` (rankings.css:18),
  `.activity-markread` (`screens/activity/activity.css:10`), `.user-menu-btn` 36×36
  (`screens/user/moderation.css:38`)

**DONE (this session):** icon buttons bumped to 44×44 (topbar, fab, resto-back,
resto-savecheck, user-menu-btn); pills/text-buttons given `min-height:44px` +
flex-centering (cheers, mesa-chip [+`min-width:44`], upill, share-pill, link-action,
resto-rankagain/time/seeall, tonight-join, friend-follow, compare__same, rank-skip,
dish-head__camera, activity-markread, resto-condensed__back); dish inputs
`min-height:44`; `.mesa-toggle` keeps its 42×25 visual with a `::before` hit area
(measured **44×44**); onboarding checkbox → 22px in a `min-height:44` label. Tab bar
`align-items:stretch` + min-height 56 → **tab-link 78×55**; label 8.5→**10px**
(not 11 — 11 crowded 4 labels), icons 16→**22px**. `.map-pin` gets a transparent
SVG hit circle → **27×27** hit (was 5–12); a full 44 was capped short so dense
barrio pins stay individually tappable. **Browser-verified** the measured sizes above.
*Tradeoff:* 44px filter chips read chunkier than the old tight mono rail — the
accessibility cost of WCAG 2.5.5; can revert to the AA 2.5.8 (24px + spacing) rule if
you prefer the tighter look.

## 3b. Sub-11px text (raise to ≥11px, ideally native minimums)

- [ ] `.scorebadge__badge` **7px** (×36, patterns.css:99), `.lb-meta` 9px (×82),
  `.mesa-chip` 9px (×21), `.feed-time` 9px (×17), `.stat__l` 8.5px, `.rank-row__badge`
  8.5px (`screens/onboarding/rank.css:162`), `.friend-row__meta` 9px,
  `.tonight-card__*` 9px. Nudge these toward 11px+; keep the mono-caption aesthetic.

## 3c. Sticky `:hover` on touch (14 ungated rules)

On iOS, tapping fires `:hover` and it **sticks** until the next tap elsewhere — reads as
a stuck state. **14 `:hover` rules, 0 gated.**

- [x] Wrap every `:hover` rule in `@media (hover: hover) and (pointer: fine) { … }`.
  Grep: `grep -rn ':hover' apps/app/src --include='*.css'`. Known files: `topbar.css:47`,
  `feed.css`, `rankings.css:219,222`, `onboarding/rank.css:61` (this one is **dead CSS**
  — see 3f), plus others the grep finds.

**DONE (this session):** wrapped all 13 live `:hover` rules in `@media (hover:
hover) and (pointer: fine)` across topbar, ui (3 button variants), patterns
(upill), rankings (share-pill, link-action×2), profile-nav, settings (id-link,
row btn/link), moderation (menu). `.versus:hover` left ungated — it's dead CSS
removed in group #6. `.screen-header__back:hover` was already gated (Pass 1).
**Verified** on the touch-emulated viewport: `(hover: hover)` resolves **false**,
so none of the gated hovers apply on tap (no sticky-hover).

## 3d. Add `:active` press feedback (~25 tappable elements have none)

Only 14 elements have `:active`; ~25 more tappable elements have none. Add a subtle
`:active { transform: scale(0.97) }` with `--ease-out` (see 3e) to: `.link-action`,
`.settings-row--btn`/`--link` (settings.css:72), `.settings-id--link`, `.profile-nav__row`
(profile.css:12), `.upill`, `.mesa-chip`, `.mesa-toggle`, `.theme-swatch`,
`.user-menu-btn`, `.activity-row__follow`, `.activity-markread`, `.tonight-join`,
`.resto-rankagain`/`.resto-savecheck`/`.resto-time`/`.resto-seeall`, `.danger-btn`
(profile.css:155), `.avatar-btn`, `.explore-row`/`.explore-member`, `.resto-friend`,
`.saved-row`, `.map-card__go`. Gate under `@media (hover: hover)`? No — `:active` is
correct on touch; keep it ungated.

**DONE (this session):** added one consolidated, ungated press-feedback block in
`styles/global.css` (23 selectors → `transform: scale(0.97)` + `transition:
transform 0.12s var(--ease-out)`). Placed in global (not per-component) so it
can't drift, and the transition rides on `:active` — higher specificity than the
base rule — so it never clobbers a component's own transition. `.map-card__go`
/ `.map-card__dir` got their own `:active` (Option A). **Verified** the block
matches all 23 selectors in the live stylesheet; app renders clean.

## 3e. Motion: one bouncy curve is used for everything (Emil lens)

`--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1)` (overshoot 1.56, tokens.css:129) is
applied **18 times** — including press feedback, a `width` transition, and a `background`
transition, where overshoot reads as a lurch (color/width can't visibly overshoot).

- [x] Add `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)` to tokens.css. Use it for press
  feedback and entrances. **Keep** `--ease-spring` only for genuine celebration moments
  (`cheers-pop`, `stamp-in`).
- [x] `transition: width 0.3s var(--ease-spring)` (`styles/screens.css:232`) → animate
  `transform: scaleX()` with `transform-origin: left` (GPU, not layout).
- [x] `transition: background 0.18s var(--ease-spring)` (`components/ui/ui.css:292`) →
  `... ease` (no spring on a color).
- [x] `transition: all 0.12s ease` ×2 (`components/ui/ui.css:193`,
  `screens/onboarding/friends.css:48`) → explicit properties.
- [x] `.feed-card { animation: feed-card-in 0.5s … }` (`feed.css:15`) — 500ms is long and
  every card enters at once. Reduce to ~300ms + `nth-child` stagger (~40ms, cap ~6).
- [x] `.tab-body { animation: screen-in 0.3s … }` fires on every tab switch (tens/day) —
  reduce to ~180ms or drop.

**DONE (this session, group #6):** `--ease-out` added Pass 1; here every remaining
`--ease-spring` was swapped to `--ease-out` across press-feedback + entrances so
**only `cheers-pop` and `stamp-in` keep the spring** (grep-verified). Progress bar
now animates `transform: scaleX(pct/100)` (`transform-origin:left`, ease-out) —
GPU, no overshoot; TSX in `Onboarding.tsx` updated to match (synthetic-verified:
`scaleX(0.4)` → 40% width, left-aligned). Toggle background → `ease`; `.mesa-chip`
+ `.friend-follow` `all` → explicit props. `.feed-card` entrance **0.5s spring →
0.3s ease-out** (the per-card stagger already lives inline in `DiscoverTab`, so no
`nth-child` block was needed — verified 0.3s duration live). `.tab-body` screen-in
**0.3s → 0.18s** ease-out.

## 3f. Discrete bugs (each verified)

- [x] **`.resto-map` has NO CSS rule anywhere** and there's no global `img{max-width:100%}`
  reset. `mapboxStaticUrl` (`lib/media.ts:36`) requests `700x260@2x` → **1400px intrinsic**
  inside a 327px column. Fires page-wide horizontal scroll the moment `VITE_MAPBOX_TOKEN`
  is set (`RestaurantProfile.tsx:279`). Fix: add a `.resto-map` rule
  (`max-width:100%; height:auto; …`) and/or a global `img { max-width: 100%; height: auto }`.
- [x] **Profile-edit Save off-screen:** `.profile-edit { min-height: 100dvh }`
  (`screens/tabs/profile.css:118`) is nested inside `.tab-body`'s padding, pushing the
  `.spacer`-anchored Save button a full viewport + ~140px down, behind the tab bar
  (`ProfileTab.tsx:184-235`). Remove the `min-height:100dvh` / restructure.
- [x] **Errors render as empty states** (failed query looks like "no data"): add an
  `isError → <ErrorState>` branch to `ExploreScreen.tsx:127`, `MapScreen.tsx:107`,
  `ActivityScreen.tsx:98`. Pattern already exists in `ListScreen`/`RankingsTab`.
- [x] **Destructive delete with no confirm:** `RankingsTab.tsx:294` deletes a ranking
  outright; account deletion on the same screen confirms. Add a confirm step.
- [x] **`⋯` menu never dismisses:** `UserRankings.tsx:98-122` menu has no outside-click /
  Escape handler.
- [x] **CTA bar covers content:** `TonightDetail`'s fixed `.resto-cta-bar` (~76px) covers
  the last ~28px of `.dish-detail` (bottom padding only `safe + 48px`, `dish.css:184`).
  Increase bottom padding to clear the bar.
- [x] **Missing filtered-empty state:** `TonightTab.tsx:56` renders a blank region when the
  "Seats left"/"8p+" filter matches nothing. Add a message.
- [x] **Missing pending/disabled:** `SavedRow` Remove lacks `disabled={remove.isPending}`
  (`RankingsTab.tsx:336`); "Verify email" not disabled while in flight
  (`SettingsScreen.tsx:257`).

**DONE (this session, group #5):** global `img { max-width:100%; height:auto }`
guard + a proper `.resto-map` rule (verified: guard active on a bare img, no
h-scroll, fallback framed). Removed `.profile-edit { min-height:100dvh }` — Save
now renders at y≈495 (was off-screen). `isError → <ErrorState>` on Explore/Map/
Activity. Ranking Remove is now a two-step confirm (verified Remove→Confirm/
Cancel, Cancel reverts). `⋯` menu closes on outside-pointerdown **and** Escape
(both verified). `.dish-detail` bottom padding raised to clear the ~77px CTA bar
(verified content clears at scroll bottom). Tonight filtered-empty message added.
SavedRow Remove + Verify-email now disable while pending. *The two remaining 3f
items (dead `.versus`/`.map-pill` CSS, ad-hoc z-index) are deferred to group #6.*
- [x] **Dead CSS to delete:** the entire `.versus*` block (`onboarding/rank.css:47-118`)
  and `.map-pill` (`map.css:159-172`) — no TSX renders them.
- [x] **Ad-hoc z-index:** `map.css:72,82` use `40`/`41`, above the app's implicit ladder
  (tab-bar 10, cta-bar 15, condensed 20, topbar 30). Harmless today (Map has no bars) but
  align to a documented scale if touched.

**DONE (this session, group #6):** removed the dead `.versus`, `.versus--photo`,
`.versus__name`, `.compare__or` (0 TSX refs — grep-verified) while preserving the
shared `.rank-pick--photo` selectors, and deleted `.map-pill`. That also cleared
the last ungated `.versus:hover` from 3c. Documented the map scrim/sheet `40/41`
as an explicit "modal tier, one step above the chrome ladder" (values kept — a
modal correctly sits above topbar 30).

## 3g. Accessibility (from the technical pass)

- [x] No `:focus-visible` anywhere (only 3 `:focus` rules, all form fields). Add visible
  focus rings to buttons/links (WCAG 2.4.7).
- [x] Tab bar `<nav>` has no `aria-label`; active tab uses `data-status` with no
  `aria-current="page"` (`app/router.tsx` TabBar/TabLink).
- [x] `loading="lazy"` on the ~8 `<img>` without it (13 total, 5 have it).

**DONE (this session, group #7 / 3g):** one global `:focus-visible` rule in
`global.css` (2px brass outline + offset, follows border-radius, layout-safe) on
`a/button/input/select/textarea/[tabindex]` — **verified** a real Tab keypress
paints the ring (script `.focus()` correctly does not). Tab `<nav aria-label=
"Primary">` and `aria-current="page"` on the active `TabLink` via Link
`activeProps` (verified: active tab carries it, inactive don't). Added
`loading="lazy"` to the 6 list/below-fold thumbnails (activity, explore, list,
map-card, rank-summary, resto-map); the two hero images (restaurant cover, dish
detail) were **kept eager** on purpose — they're the LCP element on their screen.

---

## Suggested commit grouping (user runs git themselves — hand over blocks)

1. `fix(mobile): safe-area screen header — 7 trapped screens reachable (P0)` ✅
2. `fix(theme): avatar-ink + scorebadge contrast; retune Afternoon muted text (P1)` ✅
3. `fix(mobile): 44px touch targets + tab bar sizing (P1)` ✅
4. `fix(mobile): gate :hover for touch, add :active press feedback` ✅
5. `fix(ui): resto-map overflow, profile-edit save, error/empty/confirm states` ✅
6. `refactor(motion): split ease-out from spring; stagger feed; drop dead CSS` ✅
7. `a11y: focus-visible rings, tab-bar aria, lazy images (3g)` ✅ — added after the
   original plan; 3g wasn't mapped to a commit in the first six.

**All passes executed and browser-verified.** A `feat(map): 'Cómo llegar'
directions button` also shipped alongside (user-requested, outside the audit).

## Verify each pass before moving on

Deployed app auto-rebuilds on push to `main`. After each pass: reload
`https://mesaapp-production.up.railway.app`, apply the sim-safe snippet, walk the
affected routes at 375px in **both** themes, screenshot before/after. Re-run the contrast
and touch-target sweeps (measure `getBoundingClientRect` + computed color ratios) to
confirm the numbers moved. Do not mark a checkbox done on code change alone — verify the
rendered result.

## Scoreboard (baseline → target)

| Dimension | Baseline | Target |
|---|---|---|
| Accessibility | 1/4 | 3+/4 |
| Responsive | 1/4 | 3+/4 |
| Theming | 2/4 | 4/4 |
| Overall | 11/20 | 17+/20 |
