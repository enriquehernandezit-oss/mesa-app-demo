# Design reference (vendored)

The chosen look for the app: **Redesign 2** (92 phone screens, each drawn in Day and Night), plus the
**realistic Kir Royale flute** used as the "How was it?" rating graphic. These files are _reference only_ — they are
not built, imported or shipped. The written spec is `docs/DESIGN.md`; the numbers behind it live here.

The originals are Design-canvas artifacts on claude.ai:

- Redesign 2 — https://claude.ai/artifact/PkGqQtpTH9TvFyCnpdCjNz
- Realistic Bubbles (Cocktails canvas) — https://claude.ai/artifact/BdbnhJ8jYkssaXqH6hxw81

## What is here

| Path                                | What                                                                                                                                                                                                                       |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `redesign2/S00-System.dc.html`      | The system board: icon, wordmark, share cards, swatches, type ramp, score chips, the no-photo rule, tab/rank bars.                                                                                                         |
| `redesign2/B01`…`B11-*.dc.html`     | Welcome & auth, Feed, Explore, Restaurant, Rank a spot, Your list, Profile, People, Lists & dishes, Plans & events, Settings. Day on the top row of every board, Night below.                                              |
| `redesign2/Main.dc.html`            | The start page: the 13 picks and links to every board.                                                                                                                                                                     |
| `rating/F17-Bubbles.dc.html`        | The chosen rating graphic: the flute (KIR palette) through didn't love it / it was fine / loved it, Day above Night. Its exact bubble, mousse, spray and fog tables are the source for `components/rank/fluteData.ts`.       |
| `redesign2/src/*.py`                | The generators (plain Python, no dependencies). `mesa_ui.py` = tokens and primitives; `screens_a/b/c/v2.py` = screens (`v2` overrides `a`/`b`); `build9.py` = the board list; `build12.py` + `build19.py` = the rating screen and flute. |

## Viewing

Open any `.dc.html` in a browser. Photos point at `apps/api/public/restaurants/*.jpg`, so the boards must stay
in this folder depth. Instrument Serif loads from Google Fonts. The `<script src="./support.js">` line 404s
harmlessly — it belongs to the canvas runtime.

## Reading the numbers

Every value is an inline style, so `grep` finds it: e.g. `grep -o 'font-size: 46px[^"]*' redesign2/B04-Restaurant.dc.html`.
The theme variables (`--bg`, `--accent`, …) are defined once per file in the `.Day` / `.Night` blocks at the top.

## Founder overrides on top of the mock

- The logo is the lowercase word **mesa**, oxblood by day and cream by night. The mock's `M` tile + "Mesa" lockup
  is superseded.
- The capital-**M** is the **app icon only** — it is never drawn inside the app, and never on the landing/auth
  screens (wordmark only). Wherever a board shows the tile (splash, auth, verify, reset, suspended, About), the
  app uses the wordmark instead.
- Night is black with burgundy `#7a1a29` for fills. Small text that the mock draws in burgundy is cream at night.
  No pink anywhere.
