# Mesa — Design & Aesthetic

> **Source of truth: "Redesign 2".** The boards in `docs/design/redesign2/` (92 screens,
> each drawn in Day and Night) and the rating graphic in `docs/design/rating/` are the
> screen-level spec — open them in a browser; see `docs/design/README.md`. This file is
> the system behind them: tokens, type, shape, components, and the rules that don't
> change. `docs/DESIGN-PHASE6.md` and `docs/DESIGN-PHASE6-SCREENS.md` are **historical**
> (the brass/oxblood design they describe is gone). Where the code disagrees with this
> file, the code is behind — the app is being brought to this spec milestone by milestone.

Mesa ships **two themes**, both first-class, and one semantic token layer that both resolve
through. The look is fixed — you do not invent a style.

- **Day** — cream paper. `#f3ede4` ground, white cards, ink text.
- **Night** — black. `#0b0809` ground, `#171213` cards, cream text, **a bit of burgundy**.
- **Auto** — follows the OS **and the clock**: Night from 6pm to 6am or whenever the OS is in
  dark mode, Day otherwise. Mesa is a going-out app, so Auto should read as evening energy
  once it actually is evening. (`theme/ThemeProvider.tsx`, `resolve()`.)

They must feel like one product photographed at two times of day — same type, same shapes,
same burgundy thread, same imagery. A member switches in Settings and nothing moves but the
ground and the ink. Stored choice: SecureStore `mesa.theme_choice` (`auto | day | night`; the
old `afternoon | candlelit` values are migrated on read).

## Color: one token layer, one accent

**Never reference a raw color** — no hex, no `rgba()`, no brand name — in a screen or
component. Every color resolves through a **semantic** token whose _meaning_ is stable across
themes and whose value changes. Defined once:

- `apps/mobile/src/theme/vars.ts` — the `day` and `night` maps (NativeWind `vars()`), the
  source of truth. `ThemeProvider` applies the active map to a root `View`.
- `apps/mobile/tailwind.config.js` — token names → classes (`bg-bg`, `text-accent`).
- `apps/mobile/src/global.css` — `:root` = the Day map, for the frame before the provider
  mounts. It must stay identical to `vars.ts`'s `day` map.
- `useColor('token')` (`theme/useColor.ts`) for the few places that need a value, not a class
  (SVG strokes, native tints).

### Two accents, on purpose

Burgundy `#7a1a29` is Mesa's one accent, but burgundy text on black is unreadable, so it splits
by job:

| Token         | Job                                                    | Day       | Night     |
| ------------- | ------------------------------------------------------ | --------- | --------- |
| `accent`      | text, icons, borders, "on" states                      | `#7a1a29` | `#f4ede2` |
| `accent-fill` | surfaces: the +, Rank it, the slider, switches, badges | `#7a1a29` | `#7a1a29` |
| `on-accent`   | text/icons **on** an `accent-fill` surface             | `#f4ede2` | `#f4ede2` |
| `accent-soft` | a wash of burgundy behind a chip or a highlighted row  | `.08`     | `.28`     |

Never set `text-accent` on an `accent-fill` surface (burgundy on burgundy by day). **There is no
pink anywhere**, and no brass: Night is black + burgundy, nothing in between.

### Semantic tokens

| Token                                                            | Role                                                       | Day                                    | Night                                |
| ---------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------- | ------------------------------------ |
| `bg`                                                             | screen ground                                              | `#f3ede4`                              | `#0b0809`                            |
| `bg-sunk`                                                        | behind cards, tracks, photo fallback                       | `#e9e1d5`                              | `#050404`                            |
| `surface`                                                        | cards, groups                                              | `#ffffff`                              | `#171213`                            |
| `surface-raised`                                                 | name cards, inset areas                                    | `#faf7f2`                              | `#1f191a`                            |
| `text` / `text-2`                                                | primary / body                                             | `#16110f` / `#3d332d`                  | `#f4ede2` / `#d9cfc2`                |
| `text-muted` / `text-faint`                                      | metadata / placeholders                                    | `#8a7a6c` / `#b9ab9c`                  | cream `.55` / `.32`                  |
| `ink` / `on-ink`                                                 | the high-contrast solid: solid buttons, active tab, chips  | `#16110f` / `#f4ede2`                  | `#f4ede2` / `#0b0809`                |
| `chip`                                                           | floating capsule fill: pills, icon buttons, the note bar   | `#ffffff`                              | white `.08`                          |
| `danger`                                                         | errors, destructive                                        | `#b3261e`                              | `#ff6b5e`                            |
| `logo`                                                           | the wordmark                                               | `#210104` oxblood                      | `#f4ede2` cream                      |
| `tab-inactive`                                                   | inactive tab icons                                         | ink `.5`                               | cream `.55`                          |
| `line` / `line-strong`                                           | hairlines — **never flat grey**                            | ink `.09` / `.16`                      | white `.08` / `.14`                  |
| `glass`, `glass-line`, `glass-fallback`                          | translucent chrome (tab bar, toast, sticky headers)        | white `.62` / `.85` / `.94`            | white `.10` / `.14` / `#1b1516 .94`  |
| `hglass`, `hglass-line`, `hglass-fg`, `hglass-fallback`, `hchip` | the frosted panel on a photograph                          | white frost, ink text                  | **smoked** `#100b0b .58`, cream text |
| `pglass`, `pglass-line`, `pglass-fallback`                       | small controls and score pills on a photograph: dark glass | same in both themes                    |
| `bar`, `on-bar`, `bar-chip`                                      | the floating rank bar — dark in both themes                | `#16110f`                              | `#1b1516`                            |
| `on-photo`, `on-photo-2`, `photo-scrim`, `overlay-scrim`         | text and scrims over photography                           | theme-invariant except `overlay-scrim` |                                      |
| `avatar-hue-*`, `avatar-ink`, `avatar-light`                     | the initial-letter avatar gradient                         | warm tones                             | same                                 |

Load-bearing notes:

- **Light frost washes cream text out over a bright photo at night**, so `hglass` is smoked
  glass there. Don't "fix" it to follow the Day frost.
- **Photos carry their own dark island.** Text over a photograph is light-on-a-dark-scrim in
  _both_ themes; `on-photo*` and `photo-scrim` do not change per theme.
- **`ink` is not called `solid`** because Tailwind's `border-solid` would then also set a border
  color. `Button` keeps its `variant` names — `primary` (solid ink), `secondary` (the raised
  chip), `accent` (burgundy), `ghost` (hairline), `destructive` (a danger ring) — rather than
  renaming ~45 call sites to the boards' solid / chip / … vocabulary.
- **Interim:** `cat-*`, `live*`, `on-cat`, `on-live` still exist so event surfaces keep working.
  They are burgundy by day and cream at night (they double as text) and are deleted with the
  Explore milestone. Event kinds are told apart by **icon**, never by hue.

## Type

- **Display serif: Instrument Serif**, weight 400, **upright only** — the wordmark, place
  names, big numerals, quotes and notes. **No italics anywhere**, notes included.
- **UI: the iOS system font (SF Pro)** at 400 / 500 / 600 / 700. The mock draws 650; use 600.
- **No monospace.** Data numerals use `DATA_FIGURES` (see the note below on what it does per face).
- Type never uses synthesized weights or styles.

**In code** (`apps/mobile/tailwind.config.js`): `font-serif` is `InstrumentSerif_400Regular` — the
only serif class, because the face has no bold or italic (never ask for either; the old
`font-serif-semibold` / `font-serif-italic` are gone). `font-ui`, `font-ui-medium` and
`font-ui-semibold` are `fontFamily: System` + weight 400 / 500 / 600 (a small Tailwind plugin, so
the class names stayed the same); NativeWind passes the weight straight through. The size classes
that are serif (`text-display`, `text-title`, `text-serif-sm|md|lg`, `text-rank`) carry their own
line height in px. The wordmark is `<Wordmark>` (`components/ui`), `font-serif text-logo`.

**Numerals.** Instrument Serif's digits are lining but **proportional** and the font has no `tnum`
feature (measured from the font file), so `tabular-nums` does nothing on serif numerals — right-align
a stacked serif figure, or set a column of counts in the system font, where `tabular-nums` works.

| Use                                           | Size / weight                               |
| --------------------------------------------- | ------------------------------------------- |
| Hero place name                               | serif 46                                    |
| "mesa" on landing / auth (no icon above it)   | serif 72 (splash 56)                        |
| Onboarding step titles                        | serif 36 (`text-headline`)                  |
| Large titles (Explore, Your list, Plans…)     | serif 40, line height 1.02                  |
| Greeting; "How was it?" / "Which was better?" | serif 33–34                                 |
| Feed and event card titles; podium names      | serif 28                                    |
| Row names, friend-card place names, quotes    | serif 19–22                                 |
| Podium numerals                               | serif 168 / 90 / 70                         |
| Section headers (`SectionHeader`)             | UI 21/600 (`text-section`)                  |
| Body, rows, fields, CTAs                      | UI 15–16 (CTA 16/600)                       |
| Pills, secondary labels                       | UI 14/600 (`text-pill`)                     |
| Meta and eyebrows (`Eyebrow`)                 | UI 12.5/600 muted (`text-meta`), mixed case |
| Score words                                   | UI 11/600–700                               |

Serif needs generous line height (≈1.1× for titles) or it clips — set it in the size tuple, not
per call site.

## Shape, depth, glass

- **Capsules everywhere**: pills, CTAs (h54 / 46 / 40 / 36), search (h46), the tab bar (h66),
  the rank bar (h70), toasts. **Circles** for every icon button.
- **Radii:** cards 24, grouped lists and rows 22, stat tiles 20, friend cards 24, compare and
  end cards 28, photo heroes 28–32, frosted panels 30, sheets 34 (top corners), menus 16, fields 18.
- **Depth:** a two-layer warm shadow (`--lift`) **in Day only**; Night has none. Never a black
  shadow. In code: `useLift()` (`theme/useLift.ts`, the `LIFT` string in `vars.ts`) — spread it
  into `style` on cards, fields and chip-fill controls; it is `undefined` at night.
- **Radius classes:** `rounded` 18 (fields), `rounded-sm` 14, `rounded-group` 22, `rounded-card`
  24, `rounded-hero` 30, `rounded-sheet` 34, `rounded-pill` (every capsule and circle).
- **Glass:** translucent chrome (tab bar, sticky headers, toast) uses the `glass*` tokens over a
  real material on iOS 26 (`expo-glass-effect`), and the near-opaque `*-fallback` token where
  there is none. Photo panels use `hglass*`; small controls and score pills on a photograph use
  `pglass*`. One component does all three — `components/ui/Glass.tsx` (`variant` = `bar | panel |
photo`, `radius` a prop) — and tells the material Mesa's _resolved_ theme, not the OS's.
- **Bottom sheets** (`components/ui/Sheet.tsx`, `showSheet` / `pickOne`): r34 top corners, a grabber, a
  title with a close chip, one white r22 group of 50pt rows with hairlines; dismiss by tapping the
  scrim, the chip, or dragging the header down. A root overlay, so it still cannot draw over a native
  modal (`rank`, `dish/index`) — those keep native action sheets. **Settings groups** are
  `Group` + `Row`/`RowButton` (`components/SettingsRow.tsx`): one r22 card, 54pt rows.

## Components and patterns

- **Score = number + word** (`ScoreBadge`, `ScoreStack`; the word is `scoreWordKey()` in `lib/score.ts`,
  read off the displayed number, ES: Imperdible / Excelente / Bueno / Normal / Sáltalo). Serif number, then 9+ **Must go**, 8+ **Great**, 7+ **Good**,
  5+ **Fine**, else **Skip**. Three forms: a capsule (`chip` / `photo` / `solid`), a dense-row
  stack (number over a small `accent` word, right-aligned), and a glass capsule on photo heroes.
  A score is always attributed — yours, a friend's, or "Mesa's" — never the place's own rating.
- **The picture rule.** A card's picture is, in order: the friend's photo → the place's photo →
  the friend's **words** set as the picture → a **name card** (`surface-raised`, hairline ring,
  the name in serif). A place page with no photo opens on its map. No letter tiles, no stamps.
- **Tab bar:** a floating glass capsule (inset 18, 66pt, bottom `max(safe-area − 10, 16)`), absolutely
  positioned so scenes run under it. The active tab is a 46pt filled `ink` circle; the **+** is a
  50pt `accent-fill` circle. No labels. Activity's unseen signal is the **bell dot** in the feed
  header, not a tab badge.
- **Screen headers** (`ScreenHeader`): a 42pt round `chip` back button, an optional centered 16/600
  title, an optional right slot.
- **Rank bar (place page):** a dark floating pill — burgundy **Rank it** (**Rank again** once
  ranked), a cream save circle, and **Directions**.
- **Place page:** the photo _is_ the page — glass back and score, a frosted name panel (serif 46) and tag panel — with the details rising on scroll (stats: Everyone / Friends / You; friends'
  notes; dishes; info; map).
- **Feed:** a greeting header (avatar, search chip, bell; no wordmark) and pills **For you / Friends /
  Events / Lists** (**Popular** joins with its API, D10; "Your six" and the **Tonight** hero with theirs,
  D8–D9). Friend cards come in three shapes by the picture rule; a "People you may know" shelf follows
  every 6th card; "You're caught up · older below" marks where you'd stopped (SecureStore
  `mesa.feed_seen`, read once per visit); the end card offers Explore and Find friends. Once the inline
  pills scroll away, a solid bar pins them to the top.
- **Your list:** a podium — #1 a large photo card with a giant serif numeral, #2/#3 as halves.
- **Sheets** are bottom sheets (r34, grabber). **Settings** are inset grouped rows (r22, 54pt).
- **Events:** one hero card; kinds by icon; no rainbow; "live" is the accent.
- **"How was it?"** is one 3-stop slider — _Didn't love it / It was fine / Loved it_ — under a
  **realistic Kir Royale flute** that goes flat → a slow stream → lively bubbles with mousse and
  spray. Geometry and the seeded bubble tables: `docs/design/rating/F17-Bubbles.dc.html`. The
  slider only chooses which third of your list the comparison searches; scores stay by list position.

## Where color is allowed to live

A token swap reaches every screen. It does **not** reach these sites, which are the _only_
places a raw color value may appear:

1. **`theme/vars.ts`** and **`global.css`** — the palette itself.
2. **`components/ShareCard.tsx`** — the 1080×1920 story card, drawn off-screen and shared out.
   **Frozen: black `#0b0809` + burgundy + cream**, lowercase wordmark, in both themes.
3. **`components/ui/ThemePicker.tsx`** — the Auto / Day / Night tiles show each theme literally.
4. **`components/rank/Flute.tsx` + `fluteData.ts`** — the rating illustration.
5. **`components/GoogleSignInButton.tsx`** — Google's own brand colors.
6. **`components/MesaMap.tsx`**, **`lib/media.ts`** — the map's user-location dot and ring, and the
   Mapbox static-map pin.
7. **`apps/mobile/app.json`** — the native splash and icon backgrounds.
8. **`apps/api/src/lib/publicPage.ts`** (the public share pages) and
   **`apps/api/src/routes/legal-pages.ts`** (privacy/terms) — self-contained stylesheets in a
   separate package. Share pages follow the frozen card; legal pages are Day, meant to be read
   like paper. If a palette changes, change them in the same commit.

**Frozen share surfaces (a deliberate decision):** the story card and the public share page leave
the app and are viewed inside someone else's feed, so they look the same for every sharer.

## The wordmark and the icon

- **The wordmark is the word `mesa` in lowercase**, Instrument Serif, `logo` color — **oxblood
  `#210104` by day, cream by night** (oxblood would vanish on black). Rendered as text so it
  scales and themes cleanly.
- **The landing and auth screens show the wordmark only.** No icon, no tile, anywhere in the app.
  With no mark above it the wordmark carries the screen alone, so it is set at 72 (the boards, which
  draw the M icon over a 46 word, are superseded on this point).
- **The app icon is a capital serif `M`** — cream `#f1e8da` on an oxblood radial gradient
  (`#4d0b17` → `#2e0309` at 42% → `#210104`, centred at 30% / 18%), a full-bleed 1024 square (iOS
  applies its own ~22% corner mask). It exists on the home screen and nowhere else.
- Files: `assets/brand/` (wordmarks), `apps/mobile/assets/images/` (icon, splash).

## Iconography

One stroke-SVG icon language (`components/ui/icons.tsx`): 24 viewBox, stroke 1.8–2.2, round
caps and joins, `currentColor` (themes for free). Add new icons there — do not reach for a
Unicode dingbat, and never use emoji, with one exception: **🥂 is the one sanctioned emoji**,
kept _only_ in outbound share copy (WhatsApp/iMessage text) as Mesa's brand voice.

- The cheers reaction is `HeartIcon` / `HeartFilledIcon`.
- SF Symbols are allowed in genuinely native chrome only (native header buttons); everywhere
  tokened, use the stroke icons.

## Aesthetic direction

Modern iOS, not a printed magazine: full-bleed photography, frosted glass over it, capsules and
circles, big soft radii, one serif for display and the system font for everything you tap.

- **Film photography, not product photography.** Warm grain, on-camera flash. Never sterile.
- **The table, not menus.** Friends toasting, sharing plates — warm and human, never cold luxury.
- **Restraint.** One accent, one serif, generous space. Cream and black with a bit of burgundy.
- **Not Beli.** Mesa is discovery through friends: a greeting instead of a logo at the top of the
  feed, "vibe" notes not star ratings, a podium instead of a feed of chips.

When Day feels like a sterile white SaaS app it's wrong; when it feels like a dining magazine on
warm stock it's right. When Night feels like a tech dashboard it's wrong; when it feels like a dim
restaurant at 9pm it's right.

## Language & voice

**Spanish-first, informal "tú."** Mesa is built for Santo Domingo, not
translated for it after the fact. A UX audit found the shell (tab bar,
Settings, buttons, empty/error states) was English while only the ranking
flow ("¿Cómo estuvo?", "Me encantó") had been written in Spanish — copy that
drifted screen to screen instead of being decided once. This section is that
decision, so it doesn't drift again.

- **Register:** informal _tú_, never _usted_. Direct and a little breezy —
  "Intenta de nuevo," not "Por favor, inténtelo de nuevo." This was already
  the voice of the existing rank-flow copy; the sweep matched it, not the
  other way around.
- **The brand name never translates.** "Mesa" stays "Mesa" in every string,
  including ones that would otherwise read as a common noun ("tu mesa" is
  fine in prose; the product name is never re-cased or translated).
- **Kept as English loanwords** — because the 22–35 Piantini/Naco/Zona
  Colonial audience already says these, not because translating was hard:
  - **spot(s)** — Mesa's word for a restaurant/venue. Never "lugar" or
    "sitio." Established in the original rank-flow copy ("Aún no hay
    spots") before this sweep; extended everywhere "place" appeared in
    English UI, so the vocabulary is now consistent in both languages.
  - **rankear / rankeado** — the anglicized verb for the core action. Never
    "clasificar" or "calificar" (the latter also risks reading as "rate,"
    which the product explicitly is not — see the star-rating ban below).
  - **vibe** — Mesa's differentiator ("vibe-check notes, not star
    ratings"). Kept in both languages; "nota de humor" or similar loses the
    brand term.
  - **Feed, Rankings** — tab-bar nouns Spanish speakers already use
    unborrowed in this context (sports/music charts, social feeds).
- **Translated, not borrowed:** everything else. Screen titles, button
  labels, empty/error states, Settings, onboarding, legal-page entry
  copy. When in doubt, translate — the loanword list above is deliberately
  short; don't grow it by default.
- **A short glossary**, to keep new copy consistent (extend this list
  instead of re-deciding a term per screen):

  | English                  | Spanish                        | Notes                                          |
  | ------------------------ | ------------------------------ | ---------------------------------------------- |
  | Rank a place             | Rankear un spot                | tab-bar action, screen titles                  |
  | Tonight (tab)            | Esta noche                     | wraps to 2 lines in the tab bar; that's fine   |
  | You (tab)                | Perfil                         | "Tú" reads wrong as a tab label                |
  | Reserve / Order / Nearby | Reservar / Pedir / Cerca       | quick-action pills                             |
  | Settings                 | Ajustes                        |                                                |
  | Sign in / Sign out       | Iniciar sesión / Cerrar sesión |                                                |
  | Loading…                 | Cargando…                      |                                                |
  | Something went wrong     | Algo salió mal                 | pair with a concrete retry, not just this line |
  | Try again                | Intentar de nuevo              |                                                |

## Hard "don'ts"

- **No star ratings, anywhere, in any form.** Ranking + vibe notes only. A score is always
  attributed (yours / a friend's / all of Mesa), never presented as the place's own rating.
- **Burgundy is the only accent.** No second hue, no rainbow event colors, **no pink, no brass**.
- **No burgundy text on black.** Small accent text is cream at night (`text-accent` does this).
- **No italics.** Not in the wordmark, notes, quotes or captions.
- **No app icon inside the app** — least of all on the landing screen. The wordmark only.
- **Text over photography is always light-on-a-dark-scrim**, in both themes.
- **Day is cream (`#f3ede4`), Night is black (`#0b0809`).** Never a stark white or oxblood ground.
- **No raw colors outside the sites named above.** Enforce with (oxlint doesn't lint colors, so
  this grep is the enforcement):
  ```
  grep -rnE "#[0-9a-fA-F]{3,8}\b|rgba?\(" apps/mobile/src \
    | grep -vE "src/(theme/vars\.ts|global\.css|components/(ShareCard|GoogleSignInButton|MesaMap|ui/ThemePicker)\.tsx|components/rank/(Flute|fluteData))"   # → 0
  ```
