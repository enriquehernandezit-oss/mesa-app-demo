# Mesa — Design & Aesthetic

> **Screen-level source of truth:** `docs/DESIGN-PHASE6-SCREENS.md` transcribes
> the authoritative 18-screen Phase 6 design (what each screen contains, in what
> order, with exact copy). `docs/DESIGN-PHASE6.md` is the token + four-pattern +
> chrome handoff. This file is the aesthetic rationale below both. When a screen's
> composition is in question, the screen spec wins.

Mesa ships **two themes**, and both are first-class. The look is still fixed —
you do not invent a style — but "fixed" now means *these two palettes and this
one semantic token layer*, not a single oxblood ground.

- **Afternoon** — the light "paper" theme. Warm ivory grounds, ink-brown text,
  aged-brass accent. The **default**. Editorial daylight: a dining magazine
  spread, not a startup dashboard.
- **Candlelit** — the original dark oxblood theme. Deep burgundy grounds, cream
  text, brass accent. After-9 energy.
- **Auto** — follows the OS `prefers-color-scheme` (dark → Candlelit, else
  Afternoon).

The two must feel like one product photographed at two times of day — same
type, same spacing, same brass thread, same imagery. A user switches in Settings
and nothing moves but the ground and the ink.

> **Why this replaces the old single-theme rule.** Earlier versions of this doc
> said "no bright/light default theme" and "don't restyle away from these
> tokens." Phase 6 (the paper redesign) supersedes that. The brand is now the
> **semantic token layer** below plus the two palettes — not the raw oxblood hex
> values. Do not reintroduce a "one true ground."

## How color works: the semantic token layer

**Never reference a raw brand color** (`--ink`, `--cream`, `--brass`, a hex, or
an `rgba()`) anywhere in the app. Every color in the app resolves through a
**semantic** custom property whose *meaning* is stable across both themes; only
its value changes. This is the whole mechanism that lets one component look
right on both grounds.

Defined once in `apps/app/src/styles/tokens.css`:
- `:root { … }` — the **Afternoon** values (the default ground).
- `html[data-theme="candlelit"] { … }` — the **Candlelit** overrides.

`data-theme` is *always* present on `<html>` (Auto is resolved to a concrete
theme in JS before first paint — see `apps/app/src/styles/theme.ts` and the
inline boot script in `index.html`). There is no third CSS state.

### Semantic tokens

Afternoon values are the **exact Phase 6 handoff palette** (see `docs/DESIGN-PHASE6.md`).

| Token | Role | Afternoon | Candlelit |
|---|---|---|---|
| `--bg` | screen ground (`--screen`) | `#f5efe4` | `#210104` |
| `--bg-sunk` | app bg / behind cards / photo fallback (`--paper`) | `#e7dccb` | `#180b0b` |
| `--surface` | cards, sheets, tab bar (`--card`) | `#fffdf8` | `#2c1516` |
| `--surface-raised` | raised elements (one card color in Phase 6) | `#fffdf8` | `#391c1d` |
| `--text` | primary text, FAB fill, dark badges (`--ink`) | `#2a1512` | `#ebe4d6` |
| `--text-2` | body copy where `--ink` is too heavy (`--body`) | `#4a3b32` | `#dcccbb` |
| `--text-muted` | captions, metadata, inactive (`--muted`) | `#a2917f` | `#a3867a` |
| `--text-faint` | annotation-level text only (`--faint`) | `#b0a08e` | `#7d6459` |
| `--accent` | brass — active states, scores, primary accent | `#9a6a28` | `#c09050` |
| `--accent-strong` | brass on small text / eyebrows / pill labels (`--deep`) | `#8a5a2a` | `#e2c179` |
| `--accent-fill` | solid brass fill (the one filled CTA / chips) | `#9a6a28` | `#c09050` |
| `--on-accent` | text/icon **on** a brass or ink fill | `#fdf7ec` | `#210104` |
| `--tab-inactive` | inactive tab-bar item | `#8a7b6c` | `#8a7166` |
| `--line` / `--line-strong` | warm hairlines — **never flat grey** | `rgba(120,80,60,.12/.16)` | `rgba(235,228,214,.10/.16)` |
| `--brass-line` / `--brass-line-soft` / `--brass-wash` | outlined pills, active chips, filled chips | `rgba(154,106,40,.4/.28/.1)` | `rgba(226,193,121,.4/.28/.12)` |
| `--on-photo*` / photo scrims | text/scrims over photography — **theme-invariant** | light / dark | light / dark |
| `--shadow-card` / `--glow-*` | elevation & emphasis | warm brown, never black | warm black / brass bloom |
| `--grain-tint` / `--grain-blend` / `--grain-opacity` | film-grain overlay | `multiply`, warm | `soft-light`, black |
| `--status-packed/good/building/slow` | nightlife status | `#c2603a`/`#9a6a28`/`#97794f`/`#8a7b6c` | per-theme |

Notes that are load-bearing, not stylistic:

- **Brass darkens on paper.** Afternoon `--accent` is `#9a6a28`, `--accent-strong`
  (`--deep`) `#8a5a2a` — a *dark* accent on a light field. On Candlelit it inverts
  (`--accent-strong` is *brighter* than `--accent`). Nothing references a raw
  "brass" name — it would lie on paper.
- **`--accent-fill` is now per-theme** (`#9a6a28` on paper, `#c09050` on oxblood);
  the text on it flips via `--on-accent` (cream on paper's ink/brass fills).
- **One card color in Phase 6.** `--surface`/`--surface-raised` are both `#fffdf8`
  on paper; the skeleton shimmer no longer depends on the two differing — it
  shimmers across `--bg-sunk → #f0e7d8 → --bg-sunk`.
- **Monospace is a first-class family (`--font-mono`, JetBrains Mono).** It carries
  all metadata, eyebrows, and pill labels — the "spec-sheet" voice. Theme-invariant.
- **Photos carry their own dark island.** Text over a photograph is always
  light-on-a-dark-scrim, in *both* themes. `--on-photo*` and the scrims are
  deliberately theme-invariant.

### Type & spacing

Type family, scale, spacing, radii, and motion tokens are theme-independent and
also live in `tokens.css` (`--font-serif`, `--font-ui`, `--text-*`, `--space-*`,
`--radius*`, `--ease-spring`, `--tracking-eyebrow`, `--safe-*`).

- **Display serif:** Cormorant Garamond (wordmark `mesa`, restaurant names, the
  big rank numerals). Georgia is the fallback.
- **UI / body:** Plus Jakarta Sans.
- **Metadata / eyebrows / pill labels:** JetBrains Mono (`--font-mono`), weights
  400–500 — the Phase 6 "spec-sheet" voice on every place listing.
- **Eyebrows:** uppercase, letter-spaced ~0.16em, small, in `--accent`.
- **Editorial italic:** the quiz tagline treatment — italic serif for editorial
  moments.

## Where color is allowed to live

A token swap in `tokens.css` reaches every CSS file and every inline `style`
prop in TSX (all of which use `var(--token)`). It does **not** reach four sites,
which are the *only* places a raw color value may appear. If you touch color,
these are the sites to check — the audit does not need to be redone:

1. **`apps/app/src/lib/shareCard.ts`** — the 1080×1920 canvas story card. Canvas
   cannot resolve `var()`. **Frozen as Candlelit brand** (see below).
2. **`apps/api/src/routes/share-pages.ts`** — a self-contained stylesheet for the
   server-rendered public OG/share pages. Separate workspace package; a token
   swap never reaches it. **Frozen as Candlelit brand** (see below).
3. **`apps/app/capacitor.config.ts`** — the native pre-paint `backgroundColor`.
   Set to the Afternoon ground (the default); a Candlelit user accepts a
   sub-100ms light flash on cold start.
4. **`apps/app/src/screens/map/MapScreen.tsx`** — the inline SVG `<stop>`s use
   the CSS `stop-color` *property* (which accepts `var()`), not the presentation
   attribute. So they follow the tokens; do not hardcode them.

**Frozen share surfaces (a deliberate decision):** the story card and the public
share page are artifacts that *leave* the app and are viewed inside someone
else's feed. They stay Candlelit (oxblood) regardless of the sharer's theme, so
every shared Mesa card looks the same. Do not "fix" them to follow the theme.
If that decision is ever reversed, `share-pages.ts` must gain a
`prefers-color-scheme` `@media` block **in the same commit** as any palette
change, or its second `:root` will drift from the app's.

## The wordmark

Lowercase serif `mesa`, in `--text` on `--bg`. Rendered as text (it scales and
themes cleanly). Real file: `assets/brand/mesa-wordmark-burgundy.png`. A
hand-drawn table-sign icon variant is the app icon; keep the two consistent.

## Aesthetic direction (from the moodboard)

Reference images live in `assets/moodboard/`. The through-line holds in both
themes:

- **Film photography, not product photography.** Warm grain, slight blur,
  on-camera flash. Never sterile, never flat.
- **The table, not menus.** Friends toasting, sharing plates — the social act of
  eating. Warm and human, never cold luxury.
- **Editorial restraint.** Big serif, generous negative space, one brass accent
  at a time. A magazine dining editorial.
- **Candlelit imagery on both grounds.** Afternoon is a *paper* ground under
  *candlelit* photos — the warmth comes from the imagery and the ivory (never
  pure white), not from a dark UI.

When Afternoon feels like a sterile white SaaS app, it's wrong; when it feels
like a dining magazine printed on warm stock, it's right. When Candlelit feels
like a tech dashboard, it's wrong; when it feels like a dim restaurant at 9pm,
it's right.

## Language & voice

**Spanish-first, informal "tú."** Mesa is built for Santo Domingo, not
translated for it after the fact. A UX audit found the shell (tab bar,
Settings, buttons, empty/error states) was English while only the ranking
flow ("¿Cómo estuvo?", "Me encantó") had been written in Spanish — copy that
drifted screen to screen instead of being decided once. This section is that
decision, so it doesn't drift again.

- **Register:** informal *tú*, never *usted*. Direct and a little breezy —
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

  | English | Spanish | Notes |
  |---|---|---|
  | Rank a place | Rankear un spot | FAB, screen titles |
  | Tonight (tab) | Esta noche | wraps to 2 lines in the tab bar; that's fine |
  | You (tab) | Perfil | "Tú" reads wrong as a tab label |
  | Reserve / Order / Nearby | Reservar / Pedir / Cerca | quick-action pills |
  | Settings | Ajustes | |
  | Sign in / Sign out | Iniciar sesión / Cerrar sesión | |
  | Loading… | Cargando… | |
  | Something went wrong | Algo salió mal | pair with a concrete retry, not just this line |
  | Try again | Intentar de nuevo | |

## Hard "don'ts"

- **No star ratings, anywhere, in any form.** Ranking + vibe notes only. A score
  is always attributed (yours / a friend's / all of Mesa), never presented as
  the place's own rating.
- **Brass is the only accent.** No system-blue, no second accent hue.
- **Text over photography is always light-on-a-dark-scrim**, in both themes.
- **Never a pure-white ground, never pure black.** Afternoon's `--bg` is warm
  ivory (`#f5efe4`); the extremes are `#fffdf8` and `#2a1512`.
- **No raw brand colors or hex/rgba outside `tokens.css`** and the four sites
  named above. Enforce with:
  ```
  grep -rn "var(--ink\|var(--cream\|var(--dim\|var(--brass\|var(--surface-2" apps/app/src   # → 0
  grep -rnE "#[0-9a-fA-F]{3,8}|rgba?\(" apps/app/src --include="*.css" | grep -v tokens.css  # → 0
  ```
  (Biome does not lint CSS, so these greps are the enforcement mechanism.)
