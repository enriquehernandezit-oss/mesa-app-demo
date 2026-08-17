# Mesa — Phase 6 Screen Spec (the 18-screen design)

This is the **authoritative screen-by-screen transcription** of the Phase 6 design the
founder handed off as 18 rendered mocks (9 flows, drawn at a 284×600 frame — font sizes are
device-realistic, do not scale up). It supersedes the compositional guidance in
`docs/DESIGN-PHASE6.md`, which covered tokens + the four repeating patterns but not the full
screens. Token layer, the four patterns, and chrome rules from `DESIGN-PHASE6.md` still hold;
this doc says **what goes on each screen and in what order**.

Both themes stay (Afternoon default + Candlelit). The mocks are drawn in Afternoon; every new
surface must also resolve in Candlelit. Every new token gets a Candlelit value.

## Global rules for this phase

1. **Inert-by-design controls.** Reservation/ordering/table actions render *exactly* as
   designed but do nothing — they are "stale". They must NOT look disabled (no dimming, no
   `:disabled`); they look live. A no-op handler + a `data-stale` attribute marks them. This
   covers: Reserve/Order action pills, the restaurant "RESERVE A TABLE" section + time chips,
   Tonight "Join" / "Take a seat", profile "Message". The rest of the demo works end to end.
2. **Filter chips are stadium/pill radius** (`--radius-pill`), overriding the 8px in
   `DESIGN-PHASE6.md §3.4`. Mono 9px, `--surface`/`--line-strong` inactive, `--brass-wash`/
   `--brass-line-soft`/`--accent-strong` active.
3. **Mono voice** carries every timestamp, count, meta line, section header, pill/chip label,
   eyebrow. Serif for names/scores/quotes. Sans for UI/body.
4. **Section headers**: mono brass eyebrow, optional right-aligned mono link
   ("FEATURED LISTS … See all", "POPULAR DISHES … See all photos", "HER TOP PLACES … All 41").
5. **Score circles are always attributed** (badge naming whose score). Friend/aggregate badges
   show a **bare count** ("6", "4"). Owner badges show a **first name** — never an inferred
   gendered possessive. The mocks' "Hers"/"His" become first names / host first-name.
6. **One ink-filled CTA per screen** with the brass glow; everything else outlined or plain.

## 01 · Home feed — A1 loading · A2 empty · A3 full

Top bar: serif wordmark 900 left; trophy (→ leaderboard) + bell (→ activity) glyph buttons right.

**Quick-action rail** directly under the top bar (all three screens): three outlined mono
pills with a leading glyph — `◉ Reserve` · `▤ Order` · `➤ Nearby`. Reserve + Order are **inert**.
Nearby → map.

**A3 full:**
- `FEATURED LISTS` section header + `See all`. Horizontal rail of **light cards**: veiled photo
  on top (radius ~12), then on paper **below** the photo a sans title + mono progress
  ("3 of 10 ranked"). NOT overlay text on the photo.
- Feed column of cards:
  - **Ranking card** (paper, no cover photo): row = avatar + "**Name** ranked a place", and
    directly beneath that line a mono timestamp ("2h ago"); a badged score circle (md) pinned
    top-right; serif place name; characteristics (tags brass · "$$$ | Parrilla, Argentine" ink
    · "Piantini · 1.2 km · till 1a" muted); serif-italic quoted note ("Get the branzino, sit
    outside."). Cheers footer (working).
  - **Dish card**: veiled photo with `film · candlelit` mono tag (top-left) + a caption block.
- No Trending / "Para ti" rails (removed this phase).

**A1 loading:** skeleton must **hold the action rail + the featured-lists carousel + the feed
card geometry** so nothing reflows on arrival. Shimmer paper→`#f0e7d8`→paper, 520px, 1.4s, 8px.

**A2 empty (new account):** serif "Your table is set" + body "Follow a few friends and their
rankings fill this feed."; mono "START WITH THESE"; 3 rows: avatar · **Name** · mono
"41 ranked · Piantini" · outlined **Follow** pill (working).

## 02 · Rank a place — B1 find · B2 compare · B3 score · B4 note

- **B1** header "✕ Rank a place". Filter chips: `Nearby · Open now · Reserve · $$$`. Result
  rows: 44px thumb + name + chars (incl. distance + hours); right side = mono "not ranked" OR
  a sm score circle if already ranked. Footer link "+ Can't find it? Add a new restaurant".
- **B2** back + mono "3 of 5" (progress). Serif "Which was better?"; mono sub "Your answer
  moves Lumbre, not the place's rating." Two **compare cards** stacked, `About the same` pill
  between. Each card = veiled photo, serif name, chars; the challenger shows subline
  "new to your list", the incumbent shows "#4 on your list" + a sm score circle.
- **B3** mono "YOUR SCORE" → **88px serif brass** score → serif name → centered chars →
  brass-wash mono pill "#3 of 25 on your list" → neighbor rows (mono position · name · serif
  muted score; the just-placed row highlighted on a card) → ink CTA **"Add a note"**.
- **B4** header "‹ Add a note" + mono "Skip". Place summary card (thumb · name · chars · serif
  score). Note textarea (serif italic, placeholder note). Mono "OCCASION" + chips
  `Date night · Special occasion · Group dinner · Outdoor · Solo` (multi-select). Mono
  "ADD A DISH" + dashed "+" tile (+ any attached thumb). Ink CTA "Post ranking".

## 03 · Post a dish — C1 shot · C2 caption+link · C3 live

- **C1** header "✕ Recents" + mono "Camera". Big square preview with `film · candlelit` tag.
  Treatment chips `Candlelit · Daylight · None`. Recents thumb strip. Ink CTA "Next".
- **C2** header "‹ New dish". Thumb + dish-name input (mono sub-label "Dish name") + serif
  italic caption ("Falls apart under the fork."). Mono "LINKED RANKING" + place card
  (thumb · name · chars · serif score). Toggle rows: "Also add to Want to try" (off) /
  "Share to friends only" (on, brass). Ink CTA "Post dish".
- **C3 dish detail** (new screen): hero photo (`film · candlelit` tag); serif dish title; serif
  italic caption; linked place card (name · chars · sm score circle badged "You"); utility
  pills `Website · Call · Route`; [avatar stack + "Camila and Lucía saved this" — omitted:
  no dish-save concept yet].

## 04 · Restaurant profile — D1 top · D2 scrolled

- **D1**: veiled hero (`film · candlelit` tag; back + share + ⋯ controls over it). Serif name
  with an outlined "Rank again" pill + a circled ✓ beside it (when you've ranked it). Overall
  row: outlined score pill "8.8" + mono "214 rankings". **List-membership pills**
  ("≡ Mesa Best · DR 2026" · "≡ Top Date Night"). Characteristics (tags · "$$$ | Parrilla,
  Argentine" · "Piantini, Santo Domingo" · social "MP 2 friends want to try"). Utility pills
  `Website · Call · Directions`. Mono "SCORES" + badged trio (You #3 on your list · Friends 6
  what they think · All of Mesa 412 ranked — the Mesa circle is unbadged/muted). Ink CTA
  "Rank this place" (stays visible).
- **D2 scrolled**: condensed sticky header "‹ Lumbre 8.8". Mono "RESERVE A TABLE" + right mono
  "2 · tonight ✎"; time chips `7:00p · 7:15p · 9:30p · more` — **all inert**. Mono
  "POPULAR DISHES" + "See all photos"; 3 dish thumbs w/ name + mono "9 photos". Mono
  "THEIR SCORES"; rows = avatar + name + serif-italic quote + serif score. Mono link
  "See all 6 rankings ›". Ink CTA "Rank this place" persists.

## 05 · Profiles — E1 you · E2 someone else

- **E1**: top bar = bold name left, share ↗ + settings ≡ right. Centered warm avatar. Bold
  @handle. Mono "Member since October 2024 · Piantini". Stats trio (bold serif number, mono
  label): Followers · Following · **Rank in DR** ("#412"). Outlined pills "Edit profile" ·
  "Share profile". Nav rows on cards: "✓ Ranked 25 ›" · "◇ Want to try 12 ›" · "♡ Recs for
  you ›". Two stat cards: "Rank in DR #412" · "Current streak 3 weeks". Tab bar visible.
- **E2**: back header + ⋯ menu (hosts Block/Report). Centered avatar. Bold @handle. Mono
  "41 ranked · Piantini". Brass-wash "+72% taste match" pill. Ink "Follow" + outlined
  "Message" (**inert**). Mono "{FIRSTNAME}'S TOP PLACES" + "All 41". Numbered rows (numeral ·
  name · chars · sm score circle). No tab bar (own back header).

## 06 · Explore & Activity — F1 explore · F2 activity

- **F1**: search field ("Search a place, dish, or member"). Action rail (same 3 pills). Chips
  `⇅ Score (active) · Piantini · $$$ · Open now`. **Numbered** result rows (numeral · thumb ·
  name · chars · sm score circle with bare-count ink badge). Tab bar visible on this screen in
  the mock via its own shell.
- **F2**: header "‹ Activity" + mono "Mark read". Chips `All · Follows · Rankings · Tables`.
  Mono section headers `TODAY` / `THIS WEEK`. Rows carry **thumbnails + actions**:
  - ranking row: "**Camila** ranked Lumbre 9.1 — above your 8.8" + mono time + photo thumb.
  - table row: "**Tomás** opened a table at Fogo de Naco · 8:30p" + mono "2 seats left" +
    "Join" pill (**inert**).
  - save row: "**Lucía** saved your short rib photo" + photo thumb.
  - follow row: "**Javier** started following you" + mono "+41% taste match" + "Follow" pill
    (working).

## 07 · Auth + onboarding — G1 welcome · G2 seed

- **G1**: **paper ground** (Afternoon; Candlelit keeps a photo). Wordmark 900. Mono "INVITE
  ONLY · SANTO DOMINGO". Serif-italic "Rank where you eat. Trust who you know." Sans "No stars,
  no strangers. Just your friends' numbers, in order." Ink "Continue with Apple"; outlined
  mono "Use a phone number" (+ email & password + Instagram, kept per founder, same outlined
  mono treatment). Mono footer "Have an invite code? Enter it" (opens a field; soft-fails).
- **G2**: brass progress bar + mono "Step 2 of 5 · builds your starting list". Two **compare
  cards** (same component as B2) + "About the same" between. Mono footer "Haven't been to one?
  Swap it out" (swaps the non-pivot candidate).

## 08 · Settings — H1

Header "‹ Settings". Profile card (avatar · name · mono "@handle · 25 ranked" · ›) → profile.
`APPEARANCE`: 3 swatch cards Afternoon / Candlelit / Auto (real paper+ink swatches, mono
labels). `YOUR LIST`: "Friends-only scores" toggle (real client pref) · "Stealth mode" toggle
(stale) · "Export my rankings ›". `ACCOUNT`: "Notifications ›" (stale) · "Invites — mono
'4 left'" (stale) · "Log out". Kept below (compliance, not in mock): email link/verify,
Blocked accounts, legal links, **account deletion** (App Store 5.1.1).

## 09 · Tonight · Sobremesa — I1 tables · I2 detail

Fed by **in-app typed fixtures** (no schema/API). All join/seat actions **inert**.
- **I1**: serif "Tonight" + mono date pill ("Fri 9 Aug"). Chips `All · Near me · Seats left ·
  8p+`. Table cards: veiled photo + mono "2 seats left" tag (top-right); serif name + sm score
  circle badged with host first-name; chars w/ time; footer avatar stack + "Tomás hosting ·
  Lucía in" + "Join" pill (**inert**). Tab bar visible.
- **I2**: hero photo (`film · candlelit`); serif name + score circle badged host first-name;
  chars; utility pills `Website · Call · Directions`; key-value rows When ("Tonight · 8:30p") /
  Table ("4 of 6 seats taken") / Host (avatar + name). Mono "WHO'S IN" + avatar row + dashed
  "+" tile + mono "2 open". Ink CTA "Take a seat" (**inert**).

## Locked decisions & flagged defaults

- Tonight = in-app fixtures, inert actions. · Feed keeps its search field (styled as F1's).
- Score badges = first names, never inferred pronouns. · Trending rail removed.
- Chips → pill radius. · Rank-flow sentiment step ("¿Cómo estuvo?") stays.
- ReserveSheet (WhatsApp) → replaced by the inert "RESERVE A TABLE" section; `lib/reserve.ts`
  kept for later. · Profile drops Taste card / People on Mesa / Leaderboard row (leaderboard
  stays reachable from the top-bar trophy).
- Invite-code field soft-fails ("Invites are personal — ask a friend on Mesa"); no backend.
- Dish detail omits the "saved this" line (no dish-save concept). · Activity copy → English.
- E2 header → "{FIRSTNAME}'S TOP PLACES" (pronoun-safe).
