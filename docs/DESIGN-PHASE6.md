# Mesa — Phase 6 Restyle: Handoff

The Phase 6 restyle that moved the brand from the dark oxblood ground to the
light warm-paper ground. Now a completed-and-conformed reference (see
`docs/DESIGN-PHASE6-SCREENS.md` for the screen mocks). It was a **restyle, not a
rebuild** — CSS variables, class-level CSS, and only-where-required markup; no
routing, data-fetching, query-key, schema, or auth changes. `docs/DESIGN.md`
remains the design source of truth; both the Afternoon and Candlelit themes
resolve through the token layer.

---

## 1. What changes and what does not

**Changes:** color ground (dark → light), the addition of a monospace family for
metadata, and four component patterns that must repeat everywhere a place is named.

**Does not change:** the type families for display and UI (Cormorant Garamond and
Plus Jakarta Sans stay), the spacing scale, the radius scale, the spring easing,
the safe-area handling, the tab structure, the copy.

The old palette inverted the figure and ground: cream text on oxblood. The new one
puts near-black warm ink on warm paper, and keeps brass as the only accent. Brass
now has to work as a *dark* accent on a light field, so it darkens from `#c09050`
to `#9a6a28`.

---

## 2. The token layer — replace `apps/app/src/styles/tokens.css`

Exact values, transcribed from the Phase 6 design. Do not hand-pick colors anywhere
else in the app; reference these.

```css
:root {
  /* Ground — three warm neutrals, lightest to darkest surface */
  --paper: #e7dccb;   /* app background / behind cards / photo fallback */
  --screen: #f5efe4;  /* screen background inside the frame */
  --card: #fffdf8;    /* cards, sheets, tab bar, raised elements */

  /* Ink & accent */
  --ink: #2a1512;     /* primary text, FAB fill, dark badges */
  --accent: #9a6a28;  /* brass — active states, scores, primary accent */
  --deep: #8a5a2a;    /* brass on small text / eyebrows / pill labels */
  --muted: #a2917f;   /* captions, metadata, inactive */
  --body: #4a3b32;    /* body copy where --ink is too heavy */
  --faint: #b0a08e;   /* annotation-level text only */
  --tab-inactive: #8a7b6c;

  /* Hairlines & washes — always these, never a flat grey */
  --line: rgba(120, 80, 60, 0.12);
  --line-strong: rgba(120, 80, 60, 0.16);
  --brass-line: rgba(154, 106, 40, 0.4);   /* outlined pills */
  --brass-line-soft: rgba(154, 106, 40, 0.28);
  --brass-wash: rgba(154, 106, 40, 0.1);   /* filled chips */

  /* Type — mono is NEW; it carries all metadata, eyebrows and pill labels */
  --font-serif: "Cormorant Garamond", Georgia, "Times New Roman", serif;
  --font-ui: "Plus Jakarta Sans Variable", -apple-system, BlinkMacSystemFont,
    "Segoe UI", system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, Menlo, monospace;

  /* Scale unchanged from the current tokens.css — keep --space-*, --radius*,
     --ease-spring, --safe-* exactly as they are. */
}
```

Then delete the `--ink-2`, `--surface`, `--surface-2`, `--cream`, `--cream-dim`,
`--dim`, `--brass`, `--brass-2` variables and fix every reference. `grep -rn
"var(--cream\|var(--surface\|var(--brass\|var(--dim" apps/app/src` should return
nothing when you're done.

**Nightlife status colors** stay but re-tune for a light ground:
`--status-packed: #c2603a`, `--status-good: #9a6a28`, `--status-building: #97794f`,
`--status-slow: #8a7b6c`.

Add JetBrains Mono to the font loading in `apps/app/src/styles/fonts.ts` and
`index.html` alongside the two existing families (weights 400 and 500 only).

---

## 3. The four patterns that must repeat

These are the point of Phase 6. Every surface that names a restaurant carries them.
Build each once as a component in `apps/app/src/components/` and use it everywhere.

### 3.1 Characteristics block
Four lines, always this order, always these treatments. It goes under the
restaurant name on the profile, and inside every ranking card in the feed and
every row in the rankings list.

1. **Tags** — `11.5px`, `font-weight: 600`, `--deep`, single line, ellipsis on
   overflow. Middle dot separated: `Fine Dining · Date Night · Special Occasion`
2. **Price + cuisine** — `11.5px`, `--ink`. Pipe separated: `$$$ | Parrilla, Argentine`
3. **Neighbourhood** — `11.5px`, `--muted`. `Piantini, Santo Domingo`
4. **Social proof** — 20px avatar stack + `11.5px --ink`: `2 friends want to try`

Grid, `gap: 3px`, with `margin-top: 5px` on line 4 only.

### 3.2 Badged score circles
A 46px circle: `1px solid var(--brass-line)`, `background: var(--card)`, serif
`19px` `--accent` numeral centred. A mono `7px` badge pinned `bottom: -4px; right:
-4px`, `--card` text on `--ink` fill, `999px` radius, `2px 4px` padding, naming
whose score it is: `You` / `Friends` / `Mesa`. Caption under: `10px --ink` label +
`8px` mono `--muted` sub-line (`#3 on your list`).

Never render a score without its badge. An unlabelled number is the ambiguity this
pattern exists to remove.

### 3.3 Outlined utility pills
Website / Call / Directions. Mono `9.5px`, `--deep`, `1px solid var(--brass-line)`,
`999px`, `padding: 9px 0`, `flex: 1` in a `gap: 7px` row, `text-align: center`,
`white-space: nowrap`. No fill. These are always outlined so they never compete
with the screen's one filled CTA.

### 3.4 Filter chip rail
Anything that lists gets one. Mono `9px`, horizontal scroll, `gap: 6px`.
Inactive: `--card` fill, `1px solid var(--line-strong)`, `8px` radius, `--ink` text.
Active: `--brass-wash` fill, `1px solid var(--brass-line-soft)`, `--deep` text.

### 3.5 The one-CTA rule
Exactly one brass-filled button per screen. Everything else is outlined or plain.
If a screen seems to need two, one of them is secondary — outline it.

---

## 4. Chrome and surfaces

**Tab bar** — 52px, `--card` fill, `1px solid var(--line)` top hairline,
`space-around`. Active item `--accent`, inactive `--tab-inactive`, `16px` glyph over
an `8.5px` label. The centre `+` is a 40px circle, `--ink` fill, `#fdf7ec` glyph,
`margin-top: -8px` so it breaks the bar's top edge, with `box-shadow: 0 0 18px
rgba(154,106,40,.35)`.

**Top bar** — serif `22px` `--ink` wordmark left (`font-weight: 900`), two 18px
outlined glyph buttons right (`1.5px solid #b7a893`).

**Photos** need the warm veil, or they'll read as foreign objects on paper. Two
pseudo-elements over every restaurant/dish image:

```css
.photo::before { /* warm veil */
  content: ""; position: absolute; inset: 0; z-index: 1;
  background:
    radial-gradient(120% 90% at 72% 18%, rgba(255,250,240,.12), transparent 58%),
    linear-gradient(160deg, rgba(245,239,228,.26), rgba(227,212,192,.60) 90%);
}
.photo::after { /* grain */
  content: ""; position: absolute; inset: 0; opacity: .32;
  mix-blend-mode: multiply;
  background-image: radial-gradient(rgba(120,80,60,.5) .5px, transparent .5px);
  background-size: 3px 3px;
}
```

**Skeletons** — shimmer across `--paper → #f0e7d8 → --paper`, `520px` band,
`1.4s linear infinite`, `8px` radius. Critically: the skeleton must hold the action
rail and lists carousel too, so nothing reflows on arrival.

**Avatars** — `linear-gradient(135deg, <warm hue>, var(--paper))` with `#fdf7ec`
initials at `font-weight: 700`. Hues in rotation: `#b5773c`, `#c8703f`, `#a98a63`.

**Bottom sheets** — `--card` fill, top corners `--radius`, `--line` hairline.
Never a dark scrim on a light ground — use `rgba(42,21,18,.28)`.

---

## 5. Milestone order

Nine milestones. Commit and stop after each.

| # | Milestone | Files |
|---|---|---|
| 1 | Token layer + fonts + rewrite `docs/DESIGN.md` | `styles/tokens.css`, `styles/global.css`, `styles/fonts.ts`, `index.html`, `docs/DESIGN.md` |
| 2 | Shared chrome | `components/TopBar.tsx`, `topbar.css`, `screens/tabs/tabs.css`, `components/Splash.tsx`, `styles/screens.css` |
| 3 | The four patterns as components | new files in `components/` |
| 4 | Restaurant profile | `screens/restaurant/RestaurantProfile.tsx`, `restaurant.css`, `ReserveSheet.tsx`, `reserve.css` |
| 5 | Home feed | `screens/tabs/DiscoverTab.tsx`, `feed.css`, `CheersButton.tsx` |
| 6 | Rankings + leaderboard | `screens/tabs/RankingsTab.tsx`, `rankings.css`, `screens/leaderboard/*` |
| 7 | Profiles | `screens/tabs/ProfileTab.tsx`, `profile.css`, `screens/user/UserRankings.tsx`, `moderation.css` |
| 8 | Rank flow + post a dish | `screens/rank/RankAPlace.tsx`, `screens/onboarding/RankStep.tsx`, `rank.css` |
| 9 | Auth, onboarding, map, activity | `screens/AuthFlow.tsx`, `Onboarding.tsx`, `onboarding/*`, `map/*`, `activity/*` |

Milestones 1–3 are load-bearing: 4–9 are mostly consuming what 3 produced. If a
later screen needs a fifth repeating pattern, add it to §3 rather than styling it
locally.

---

## 6. Guardrails

- **Do not touch:** `packages/db`, `apps/api`, `lib/api.ts`, `lib/query.ts`,
  `lib/auth-client.ts`, `app/router.tsx`, any hook.
- **No new dependencies.** No CSS framework, no styled-components, no Tailwind.
  Plain CSS files next to their screens, as the repo already does it.
- **Never a pure white or pure black.** `#fffdf8` and `#2a1512` are the extremes.
- **Never a flat grey hairline.** Every divider is a warm brown at low alpha.
- **Contrast:** `--muted` (`#a2917f`) on `--screen` is decorative-only. Never use
  it for anything a user has to read to complete a task.
- **44px minimum hit target** on every tap surface, even where the visual is
  smaller — pad the touch area, don't grow the pill.
- Delete the dark theme; don't keep it behind a flag. There's no light/dark toggle
  in this product and a dead branch will rot.

---

## 7. Reference

The full eighteen-screen design lives outside the repo. Its nine flows, in the
order they appear: home feed · rank a place · post a dish · restaurant profile ·
profiles · explore & activity · auth + onboarding · settings · Tonight (Sobremesa).
Flow 9 is likely not built yet — skip it unless the screens exist.

Screens are drawn at a 284×600 frame. Font sizes in this doc are the values at that
scale and are already device-realistic — do not scale them up.
