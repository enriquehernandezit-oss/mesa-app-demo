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
- Event kinds are told apart by **icon**, never by hue (`lib/eventCategory.ts` `CAT_ICON`: tasting → wine
  glass, food → fork and knife, music → note, brunch → sun, happy hour → cocktail, anything else → sparkle).
  The old `cat-*`, `live*`, `on-cat` and `on-live` tokens are gone; "live" and "starting soon" are the accent.

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
  there is none. Anything that floats over rows of _text_ — the toast, a sticky header — passes
  `solid` and takes the fallback, since the material lets the words behind it show through. Photo panels use `hglass*`; small controls and score pills on a photograph use
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
  The name card's type size is worked out in `lib/nameCard.ts` (the biggest size, a fifth of the
  box's short side, at which the name wraps into ≤ 3 lines inside the padding) — never iOS's
  shrink-to-fit, which left the same 26pt name a few points tall on one card and full size on the next.
  A thumbnail too small to read a name on (the 26pt place chip on "How was it?") shows no picture at all.
- **Tab bar:** a floating glass capsule (inset 18, 66pt, bottom `max(safe-area − 10, 16)`), absolutely
  positioned so scenes run under it. The active tab is a 46pt filled `ink` circle; the **+** is a
  50pt `accent-fill` circle. No labels. Activity's unseen signal is the **bell dot** in the feed
  header, not a tab badge.
- **Screen headers** (`ScreenHeader`): a 42pt round `chip` back button, an optional centered 16/600
  title, an optional right slot.
- **Rank bar (place page):** a dark floating pill — burgundy **Rank it** (**Rank again** once
  ranked), a cream save circle, and **Directions**.
- **Place page** (`app/r/[restaurantId].tsx`, `components/place/*`): the photo _is_ the page — a fixed
  full-bleed backdrop (the place's photo, else a MapBox map of where it is), a category chip, a frosted **name
  panel** (serif 46) and **tag panel** (where you stand, friends who ranked it or want to try it, the lists it is
  in, occasion tags) laid over it, and a hint that there is more below. Glass back, **score** ("8.7 Great · Mesa")
  and share float on the photo. Scrolling raises an r32 **details sheet** over it (stats Everyone / Friends / You;
  friends' notes with a report "···"; dishes; the round Menu · Call · Website · Directions tiles; grouped facts —
  address, hours, price · cuisine, lists; the map card; upcoming events; similar spots) while the overlay fades out
  and the top chrome trades glass for a solid bar. One floating dark **rank bar** ("Rank it" / "Rank again" in
  `accent-fill`, a cream save circle, Directions) holds the ranking action throughout. The frosted panel at
  **Night** is the smoked fill, never the system material — over a bright photo the material barely darkens and
  cream text on a white plate is unreadable.
- **Feed:** a greeting header (avatar, search chip, bell; no wordmark) and pills **For you / Friends /
  Popular / Events / Lists**. **For you** opens with **Your six** (a 2-column
  grid of 62pt tiles: picture, serif name, and _why_ in one muted line — "Diego · 9.6", "Saved · 2 friends",
  "You saved it"; hidden under two places, an odd count drops its last) and **Tonight** (a 372pt r32 photo card
  per event, swiped with a peek of the next and pager dots: glass time chip and save on the photo, a frosted
  panel with the title, place · price, faces, and **I'm going**; on a night with no events, **Tonight's pick**
  — 300pt, the place still open late that a friend ranked highest). Both come from one `GET /home`, cached
  until 5 AM Santo Domingo. Then friend cards in three shapes by the picture rule; a "People you may know"
  shelf and a **New near you** shelf (150-wide cards with a "New" pill) follow the first six; "You're caught
  up · older below" marks where you'd stopped (SecureStore `mesa.feed_seen`, read once per visit); the end
  card offers Explore and Find friends. Once the inline pills scroll away, a solid bar pins them to the top.
- **Popular** (`GET /popular`, the pill's view): _Popular this week_ (serif 28) with what it counts, a row
  of neighborhood pills (All first), then ranked rows — rank numeral, 54pt picture, serif name (+ a solid
  accent **New** pill for a place added in the last 3 weeks), `cuisine · neighborhood`, one line about the
  friends who ranked it ("Diego ranked it 9.6", "Natalia and 1 other", "3 friends"), and the `ScoreStack` at
  the right. The score is everyone's average ("Mesa's"), never a friend's. Ordering is momentum × quality:
  the week's rankings fade by half every 3 days (a save adds ½ a ranking, a cheer ¼), times a Bayesian
  average (a place needs 3 rankers; few rankers are pulled toward the city mean). The top 50 with a ranking
  this week come first; **All-time favorites** carries on by quality so the list never just stops.
- **Chips on a picture:** over a **photo** a chip is dark glass (`Glass variant="photo"`, a photo being its own
  dark island); over a **name card** — pale by day — it is a solid `ink` chip instead, because dark glass goes
  muddy grey-brown there (`components/feed/PhotoChip.tsx`). The bottom scrim is drawn only over real photos.
- **Your list** (`app/(tabs)/rankings.tsx`, `components/list/{Podium,RankRow,SavedRows,HoodCards}.tsx`): the
  title (serif 40) with Leaderboard and Share chips, the trio _places / saved / wk. streak_ as real controls,
  then a pill switcher **Mine / Saved / Neighborhoods** (one instance, so the slide survives a switch).
  **Mine:** sort and filter pills (each opens a bottom-sheet chooser), then the **podium** — #1 a 204pt r30
  card (photo under a dark fade, the position in serif 168 bleeding off the bottom, name + score at the
  right), #2/#3 halves (146pt, numeral 90, a number-only score chip) — then flat rows from #4: position,
  50pt picture, serif name, meta, what you ordered (else an occasion) in the accent, `ScoreStack`, "···"
  (note, rank again, remove) and a left swipe to remove. The podium is the head of your list **in its own
  order, unfiltered**: sort or filter and every row is a plain row (the top three of a view aren't your top
  three). A place with no photo is a plain raised card with the numeral ghosted at 14%. **Saved:** Restaurants
  (a raised card with a solid Rank pill and a close), Dishes (a two-up photo grid, the filled bookmark
  un-saves), Events (the same ticket as Explore). **Neighborhoods:** one card each — name, "N spots · avg.",
  a bar against your fullest neighborhood; a tap filters Mine to it. **Leaderboard:** a subline, pills for
  period then (after a hairline) scope, "You're #1 in the city." in the serif, rows of position + avatar +
  name + a COUNT of spots (never styled like a score), your own row raised.
- **Sheets** are bottom sheets (r34, grabber). **Settings** are inset grouped rows (r22, 54pt).
- **Explore** (`app/(tabs)/explore/index.tsx`, `components/explore/*`, `components/events/*`): the serif title,
  a **search field** — Mesa's own `Field` in the page, not the native navigation-bar search (on iOS 26 that
  folds into the bottom toolbar, behind the floating tab bar, and stacked under the title it takes the
  system's colours, unreadable at Night) — then the **Places / Events** switcher, and the **Map** as a chip in
  the bar. **Places:** pills Score ▾ / Filters (a bottom sheet of grouped rows, "Show N places") / Open now /
  Neighborhood ▾ (a bottom-sheet chooser; once set it becomes a solid pill with a ×); a Trending rail (a flame
  and the cheer count on a photo — never a score) in the default browse state; rows are raised r22 cards —
  rank, 54pt picture, serif name, meta, "N friends" — with the friends' `ScoreStack` (or "Be the first").
  **Events:** a calendar chip and a day strip (a dot per event, at most two), category pills each with its
  icon, a **Featured** pager of big photo cards (glass "Wed 30 Sep · 7 PM" chip, save, a frosted panel with
  the title, who's going and "I'm going"), then ticket cards — the date on a stub in the accent, a dashed
  seam, the kind (icon + word), when, title, spots left, who's going, save + I'm going. One big card serves
  Tonight (Feed) and Featured (`components/events/EventHero.tsx`).
- **The map** (`app/map.tsx`, `components/MesaMap.tsx`): full-bleed; Back, a line saying how many spots your
  friends ranked, and "find me" float over it as glass. A spot people you follow have ranked is a **score pin**
  (their average, in a raised pill — solid ink once chosen); every other place is a quiet dot in ONE native
  circle layer (a hundred-odd views for them was heavy and buried the pins — many places share a
  coordinate). Tapping either opens a glass card at the bottom: picture, name, meta with the distance, the
  friends' score, and a chevron into the place.
- **Profile, people and taste match** (`app/(tabs)/profile.tsx`, `app/u/[userId].tsx`, `app/match/[userId].tsx`,
  `app/people/[userId].tsx`, `app/friends/*`, `components/profile/*`): **Your profile** centres the identity — a 92pt
  photo with a round ink camera chip, the name in the serif (34), `@handle · neighbourhood · since Sep 2026`, and one
  serif line on how you eat — over a single white r22 card of counts (`ProfileStats`: Ranked · Followers · Following ·
  Week streak, each a control), **Edit profile** / **Find friends** chips, **Your top 3** as a `MiniPodium` (three equal
  132pt tiles, the numeral over the name), the events you're going to, one grouped icon list (Ranked · Saved · Your
  lists · Your dishes · Plans · Explore spots) and two tiles (rank in the DR, average score). Share and Settings are
  round chips at the top (`ProfileHeader`); once the page scrolls a glass bar with your name fades in behind them.
  **Someone else's profile** is the same head: the taste match is an accent pill ("+82% taste match") with "across 12
  shared spots" beside it, a three-count card, a solid **Follow** / a raised **Following ✓**, and their favorites as
  numbered raised cards (picture, name, meta, their order, their words, the score); report and block live behind the
  "···" chip. **The match page** is the two faces, "You and Diego", the percentage in the serif at 86, the shared
  cuisines and neighbourhoods as white pills, then Where you agree / Where you don't as raised rows with both scores
  (yours, theirs) at the right. **Followers / Following** is one Followers|Following segmented control over a grouped
  white list (42pt faces, a solid Follow or a raised Following). **Find friends** is raised cards — Invite (an accent
  round button), Contacts (a switch and Search my contacts), Instagram — then People you may know as one grouped list
  with a ✕ and a Follow each; **Import from Instagram** is the serif title, a card of four numbered steps and a solid
  Choose file. **Edit profile** is a back chip and title, the photo, labelled fields (icons for Instagram and Website),
  pills for neighbourhood, go-to neighbourhoods and cuisines, and one solid Save.
- **The event page** (`app/events/[eventId].tsx`, `components/events/EventBar.tsx`) is the place page's shape:
  the photo _is_ the page — the event's own, else its venue's, else a map of where it is — with a category chip
  (the kind's icon, "Special · Set menu RD$3,500"), a frosted title panel (serif 40) and a panel of what matters
  at a glance (when it starts — the accent once it is imminent or live — spots left, who is going; nothing for a
  cancelled event). The r32 details sheet holds When, Where (+ Directions), the description, the spots bar,
  Who's going (+ Invite friends) and a ghost Book-on-WhatsApp / Buy-tickets button; the top chrome is
  `PlaceTopChrome` (glass back and share, then a solid bar with the title and share). One floating bar holds a
  round save chip and **I'm going** in `accent-fill` — solid ink with a check once you are; a cancelled event
  keeps the bar's place but says so. The scroll choreography every photo-first page shares is
  `usePhotoPageScroll` (place, event, plan).
- **Plans** (`app/plans/*`, `components/plans/parts.tsx`, `components/FollowerPicker.tsx`): the list is raised
  r22 rows — a 56pt picture, the spot in the serif, the date and who is hosting — with a `StatusBadge` at the
  right (solid ink only for an invite that waits on you) under Pending invites / Upcoming / Past, and **New** a
  solid pill in the header. One plan opens on the chosen spot's photo fading into the ground (glass back and
  share, the same chrome as the event page): a serif title ("Vote open"), the date · who hosts, the note as a
  quote, the vote as a card of rows with a round pick mark and a **Confirm spot** chip for the host, and the
  guests as grouped rows ("Going (3)", "Maybe", "No reply") with the host / voted-for badges. **New table** and
  **Invite more** are page sheets: a round Close (first step) or Back chip, the sheet's name, the question in
  the serif (`SheetHeader` / `SheetTitle`), one solid button at the foot — Where (a search field, picture rows
  with a pick mark, chosen spots as solid pills), When (day and time pills), With whom (a search field, a raised
  **Invite** / solid **Invited** pill per follower), Review.
- **Settings, comments and share** (`app/settings/*`, `app/notifications.tsx`, `app/legal/[doc].tsx`,
  `app/moderation.tsx`, `app/photo-edit.tsx`, `app/comments/[rankingId].tsx`, `components/ShareCard.tsx`).
  **Settings** opens on a raised me card (avatar 48, name in the serif, "@handle · 143 ranked", **Edit
  profile**), then icon groups (`NavRow`: Your account · Privacy · Preferences · Notifications · About;
  Friends; Sign out on its own) — `Group` / `Row` / `NavRow` / `GroupLabel` in `components/SettingsRow.tsx`.
  **Your account** puts email (Verified ✓), Birthday, Change password and Sign out on other devices in one
  group — the inline forms open inside it on the ground colour (`Field onCard`) — and the **danger zone** is
  a ringed r22 panel with a ringed Delete account pill. **Privacy**: a switch row with its explanation,
  Blocked accounts (avatar + name + @handle + Unblock), Export. **Preferences**: **three theme tiles** — Auto
  (cream | black), Day, Night — each a small literal preview (raw colour, allowed here), the chosen one ringed
  in ink, then the language as two pills. **About**: the lowercase wordmark (the logo — never the app-icon M)
  over "Mesa 1.0.0", then the legal links. **Notifications**: a raised permission card (a solid Enable
  pill) over one group of switches. **Legal**: the document's title in the native large title, its date, the
  Spanish-only note as a soft burgundy panel (English mode), each section a 17/600 heading over 15pt prose.
  **Moderation**: raised cards — the kind and age, the content, the reason, a ringed Remove / Eject pill and a
  raised Dismiss. **Edit photo**: a round Close chip, a square frame, a round rotate chip and a solid Use
  photo. **Comments** is a sheet: the post (avatar, "Diego ranked O.Livia", their words as a serif quote, the
  score chip at the end), the thread (avatar 38, name + age, the comment, a "···"), and a composer — your
  avatar, a capsule field, a round burgundy send button that wakes once there is text.
  **The share card** (`ShareCard.tsx`, frozen — see "Where color is allowed to live"): the photo sinks into
  black under the lowercase wordmark; a spot card is `#1` in the serif, the name, the meta in small caps, the
  score as a serif figure with its **word in a burgundy chip**, their words as a quote; a list card is
  "NAME · N SAVED" over serif rows (position, name, score); the footer says "donde tus amigos comen de
  verdad".
- **Lists, dishes and menus** (`app/lists/[slug].tsx`, `app/collections/*`, `app/save-to-list.tsx`,
  `app/dish-lists/*`, `components/DishNudgeCard.tsx`, `app/dish/*`, `app/r/[restaurantId]/dishes.tsx`,
  `app/menu/[restaurantId].tsx`). A **featured list** opens on a photo that fades into the ground under the glass back
  and share chrome (`usePhotoPageScroll` + `PlaceTopChrome` with no score): "Featured · 10 spots", the title in the
  serif 40, who made it (+ **How we made it**), then numbered raised rows — a serif numeral, a 50pt picture, the spot,
  and a `ScoreStack` labelled **You** or **N friends**. **Your lists** is a 2-column grid: a dashed **New list** tile,
  then each list as a 124pt cover (its own picture, else its latest spot's, else a name card), its name and how many
  are saved. **One list** centres a 160pt cover (tap it to change it), the name in serif 34, "N saved" and its
  description (edited in place), over raised rows that end in **Already went · #N** or a quiet red **Remove**; Share
  and "···" (delete) are round chips in the header. **Save to a list** is a page sheet: the item's name, "Add to a
  list" in the serif, one grouped card of lists with a `CheckCircle` each, and a **New list** card (a dashed 64pt
  cover, the name on a serif line, suggestion pills, a solid Create). **Your dishes** opens with an **inverted ink
  card** (the `solid` fill — cream at night) for the first list waiting to be ranked, then a grouped list with a
  **Rank** chip on the unranked ones; the same card (`DishNudgeCard`) shows on the rank reveal and the composer. A
  **dish ranking** is "Your best {dish}" with flat hairline rows (a serif numeral, a 56pt picture, the place, your words),
  then "N to rank" dimmed and a solid **Rank N more**. **All dishes** is "Dishes" over the place's name and a 2-column
  photo grid, each with its name and "by {name}" + the heart. A **dish** opens on its photo (else the place's, else a name
  card) fading into the ground under glass back / heart / bookmark buttons (`CheersButton` and `SaveButton` take
  `variant="photo"`): who posted it and when, the name in serif 40, their words as a serif quote, the place as a raised
  card with the poster's score (`ScoreStack`), Call / Website / Directions as chips (`UtilityPill layout="chip"`), then
  Report (a flag and a muted label) or Delete on your own. **Post a dish** is one sheet — Cancel | Post a dish, the name
  on a serif line, Cuisine and Dish pills, a dashed Add a photo (with a photo: a 150pt square with a glass
  "film · Candlelit" chip and the Grain pills beside it), Your comment, the linked ranking as a raised card, "Share
  with friends only" and a solid **Post dish** pinned to the bottom. A **menu** is "{place} · Menu" in the header,
  a rail of section pills (the current one solid), "✓ Menu verified · Sep 12, 2026", then each section under a sticky
  serif title with its dishes as hairline rows (name, then a muted description; no prices).
- **"How was it?"** (`components/rank/{FeelStep,FeelSlider,Flute}.tsx`, `lib/feel.ts`) is one 3-stop
  slider — _Didn't love it / It was fine / Loved it_ — under a **realistic Kir Royale flute** that goes
  flat → a slow thin stream in a misted glass → five lively streams with a ring of mousse and a fizz over
  the rim. It opens on **It was fine** with **Next** already enabled; the answer is written in serif 54
  under the glass, with "Goes in the top / middle / bottom third of your list" (hidden under three places).
  One shared `level` (0–2) drives the flute, the word and the slider live while a finger drags, and snaps
  to a stop on release (a haptic tick on each stop passed; a tap on the track goes to the nearest stop; the
  pan claims only a horizontal drag so it never fights the modal's swipe-down). Bottom bar: **Add a note**
  (an _inline_ field — the Sheet and Toaster can't draw over the native rank modal) and a solid **Next →**.
  The flute is SVG (glass, drink, foam, mist) with the ~50 bubbles and fizz specks as native Views on ONE
  frame clock, paused when the screen isn't focused and frozen (a still frame that still answers the slider)
  under Reduce Motion; the bubble tables are the approved design's, extracted once into `fluteData.ts`
  (`docs/design/rating/F17-Bubbles.dc.html`). The slider only chooses which third of your list the
  comparison searches; scores stay by list position.
- **The rest of the rank flow** (`app/rank.tsx`, `components/rank/{RankHeader,PlaceLine,MiniFeel}.tsx`)
  is one modal, one look. **Find the spot:** serif 33 title with a Close chip, a search field, pills
  Nearby / Open now / Want to try (the saved places on their own), rows of a 52pt picture + serif name +
  one meta line + `ScoreStack` (or "Not ranked"). **Compare:** Back and Close chips with "1 of 6" between
  them, "Which was better?" serif 34, two r28 `CompareCard`s with **About the same** (a chip) between; no
  "swap it" — both places are on your own list. **Reveal:** "Your score" over the number in serif 84 and its
  word, the place, a burgundy "#20 of 160 on your list" pill, the place above and below it (yours ringed),
  "What did you order?", then one card per dish with a **mini slider** — the same control as "How was it?",
  26pt knob, **unset until touched** (a dish's feeling is optional; once set it can be changed, not cleared —
  remove the dish to start over) — and a dashed Add a photo on the first; then "Your friends · avg." and a
  bar with **Add a note** and **Done** (out of the way while the dish field has the keyboard). **Note:**
  the place, "Your note", the occasion pills, a pinned **Save note**. **Finish:** no stamp screen — Done
  leaves for Your list and a toast says "{place} landed at #{n} on your list." (raised as the screen
  unmounts: a toast started while the native modal is up never shows). The share-my-top-5 card lives on
  Your list's share chip.

## Where color is allowed to live

A token swap reaches every screen. It does **not** reach these sites, which are the _only_
places a raw color value may appear:

1. **`theme/vars.ts`** and **`global.css`** — the palette itself.
2. **`components/ShareCard.tsx`** — the 1080×1920 story card, drawn off-screen and shared out.
   **Frozen: black `#0b0809` + burgundy + cream**, lowercase wordmark, in both themes.
3. **`components/ui/ThemePicker.tsx`** — the Auto / Day / Night tiles show each theme literally.
4. **`components/rank/Flute.tsx` + `fluteData.ts`** — the rating illustration.
5. **`components/GoogleSignInButton.tsx`** — Google's own brand colors.
6. **`lib/media.ts`** — the Mapbox static-map pin (the map's user-location dot and its ring are constants in
   `theme/vars.ts`).
7. **`apps/mobile/app.json`** — the native splash and icon backgrounds.
8. **`apps/api/src/lib/publicPage.ts`** (the public share pages) and
   **`apps/api/src/routes/legal-pages.ts`** (privacy/terms) — self-contained stylesheets in a
   separate package. Share pages follow the frozen card (`#0b0809` / `#7a1a29` / `#f4ede2`, Instrument Serif,
   the system font for UI, a score as a number + a burgundy word chip); legal pages are Day by default and
   Night under a dark device (`prefers-color-scheme`), in system fonts only — they make no external
   request. If a palette changes, change them in the same commit.

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
    | grep -vE "src/(theme/vars\.ts|global\.css|components/(ShareCard|GoogleSignInButton|ui/ThemePicker)\.tsx|components/rank/(Flute|fluteData))"   # → 0
  ```
