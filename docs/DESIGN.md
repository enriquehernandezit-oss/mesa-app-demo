# Mesa — Design & Aesthetic

The look is **fixed** and shared with the pre-launch quiz. Someone shares a quiz
result card, taps through, and opens the app — there must be zero visual seam.
Do not invent a new style. Use these tokens exactly.

## Brand tokens (pulled from the shipped quiz)

| Token            | Value       | Use                                             |
|------------------|-------------|-------------------------------------------------|
| `ink`            | `#210104`   | Primary background (deep oxblood/burgundy)      |
| `ink-2`          | `#180B0B`   | Deeper wells, tab bar base                      |
| `surface`        | `#2C1516`   | Cards, sheets                                   |
| `surface-2`      | `#391C1D`   | Raised elements                                 |
| `cream`          | `#EBE4D6`   | Primary text, the wordmark                      |
| `cream-dim`      | `#DCCCBB`   | Secondary text                                  |
| `dim`            | `#A3867A`   | Muted / captions                                |
| `brass`          | `#C09050`   | Accent, rank numerals, active states, hairlines |
| `brass-2`        | `#E2C179`   | Brighter accent / highlights                    |
| `line`           | `rgba(235,228,214,.10)` | Hairlines / dividers                |

Nightlife status colors (Phase 2, defined now for consistency):
`packed #E0865A` · `good #C09050` · `building #A98A63` · `slow #7A6258`.

## Type

- **Display serif:** Cormorant Garamond (the wordmark `mesa` is lowercase; also
  restaurant names and the big rank numerals). Georgia is the safe fallback.
- **UI / body:** Plus Jakarta Sans (labels, buttons, metadata, body).
- Eyebrows/labels: Jakarta, uppercase, letter-spaced ~0.14–0.18em, small, in
  `brass`.
- The quiz tagline is set italic serif: _"¿Qué tipo de foodie eres?"_ — carry
  that italic-serif treatment for editorial moments in the app.

## The wordmark
Lowercase serif `mesa` in `cream` on `ink`. Real file:
`assets/brand/mesa-wordmark-burgundy.png`. There is also a hand-drawn
table-sign icon variant (the MESA banner) used as the app icon — burgundy
ground, brass table. Keep the two consistent; the lowercase serif mark is the
primary wordmark inside the app.

## Aesthetic direction (from the moodboard)

Reference images live in `assets/moodboard/` (see that folder's README — the
founder drops the 21 references there). The through-line across all of them,
so the app matches even before the images are in:

- **Film photography, not product photography.** Warm grain, slight blur,
  on-camera flash at night, imperfect and intimate. Never sterile, never flat,
  never bright-white startup UI.
- **Low light, candlelit, after-9 energy.** Deep shadows, warm highlights,
  oxblood and brass. Red velvet, dark oak, marble tabletops, silver
  candelabras, natural wine, martinis, espresso martinis.
- **People and the table, not menus.** Friends toasting, sharing plates, mid-
  laugh, feeding each other a fry, spaghetti and red wine — the social act of
  eating. Aspirational but warm and human, never cold luxury.
- **Editorial restraint.** Big serif, generous negative space on dark grounds,
  one brass accent at a time. Think a fashion magazine's dining editorial, not
  a food-delivery app.

Translate this into the UI as: dark oxblood grounds, warm imagery treated with a
subtle grain/vignette, serif headlines, brass used sparingly as the single
accent, and photography that leans candlelit and intimate. When a screen feels
like a tech dashboard, it's wrong; when it feels like the inside of a dim,
warm restaurant at 9pm, it's right.

## Hard "don'ts"
- No star ratings, anywhere, in any form. Ranking + vibe notes only.
- No bright/light default theme.
- No generic system-blue accents — brass is the only accent.
- Don't restyle away from these tokens to be "cleaner." This IS the brand.
