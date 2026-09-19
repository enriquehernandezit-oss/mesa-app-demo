import { eventCategoryText, eventPriceText } from './eventCategory'
import { dateLocale, getLanguage } from './i18n'

// Score display: stored 0–100, shown Beli-style as 0–10 with one decimal
// ("8.7"). One place so every screen and share card agrees.
export function displayScore(score: number): string {
  return (score / 10).toFixed(1)
}

// The 0–100 score for a 0-based position in a list of `total` — a client mirror
// of the server's scoreFor (apps/api/src/lib/score.ts), used to preview a score
// before it's saved. Keep the two in sync.
export function scoreForPosition(index: number, total: number): number {
  if (total <= 1) return 95
  const top = 96
  const bottom = 72
  return Math.round(top - (index * (top - bottom)) / (total - 1))
}

// Small-number ordinal, for the repeat-dish progress caption (M20 — "tu 2ª
// carbonara" / "your 2nd carbonara"). Spanish informally suffixes any number
// with "ª" regardless of the noun's gender in this kind of casual copy — no
// need to special-case 1st/21st/etc the way English does.
export function ordinal(n: number): string {
  if (getLanguage() === 'es') return `${n}ª`
  const v = n % 100
  if (v >= 11 && v <= 13) return `${n}th`
  switch (n % 10) {
    case 1:
      return `${n}st`
    case 2:
      return `${n}nd`
    case 3:
      return `${n}rd`
    default:
      return `${n}th`
  }
}

// M21 — a compact "Vie 18 sep · 7:00 PM" label for an event's start time.
// `startsAt` is a real UTC instant (same shape as a plan's own startsAt), so
// this just renders it in the viewer's own device locale/timezone like any
// other date — never Santo Domingo's, unlike the SERVER-side window math in
// routes/events.ts, which is a different concern (which events count as
// "tonight") from how one gets displayed to whoever's looking at it.
export function eventWhenLabel(startsAt: string): string {
  const d = new Date(startsAt)
  const day = new Intl.DateTimeFormat(dateLocale(), {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(d)
  const time = new Intl.DateTimeFormat(dateLocale(), { hour: 'numeric', minute: '2-digit' }).format(
    d,
  )
  return `${day} · ${time}`
}

// Price tier (1–4) as $ signs.
export function priceLabel(tier: number | null | undefined): string | null {
  if (!tier || tier < 1) return null
  return '$'.repeat(Math.min(tier, 4))
}

// Cuisine values are stored in English in the DB (seed + any future ingestion
// path) — translate at the display boundary so a data refresh never requires
// an app change, and existing/prod rows don't need a migration to read right.
// Unmapped values (a cuisine we haven't seen yet) pass through unchanged
// rather than disappearing.
//
// That passthrough is safe because the INGESTION side is closed, not because
// this map is exhaustive: both importers (googlePlaces.ts's
// GOOGLE_TYPE_TO_MESA_CUISINE and import-foursquare.ts's FSQ_TO_MESA_CUISINE)
// emit only keys that exist below and map anything unrecognized to null. So the
// only values that can reach here unmapped are the seed's own loanwords
// (Brasserie / Brunch / Tapas), which already read as Spanish. Keep that
// invariant: if you add an importer value, add its key here in the same commit.
const CUISINE_ES: Record<string, string> = {
  Contemporary: 'Contemporánea',
  Italian: 'Italiana',
  Spanish: 'Española',
  Basque: 'Vasca',
  Peruvian: 'Peruana',
  'Wine Bar': 'Bar de vinos',
  Dominican: 'Dominicana',
  Steakhouse: 'Parrilla',
  Mediterranean: 'Mediterránea',
  European: 'Europea',
  Mexican: 'Mexicana',
  Grill: 'A la parrilla',
  Japanese: 'Japonesa',
  Sandwiches: 'Sándwiches',
  Fusion: 'Fusión',
  // Added for the Foursquare import (M6) — cuisines the seed vocabulary didn't
  // cover but the real catalog does.
  Pizza: 'Pizza',
  Chinese: 'China',
  Thai: 'Tailandesa',
  Seafood: 'Mariscos',
  Café: 'Café',
  // Added for the Top 100 catalog import (M5) — see import-top100.ts's own
  // cuisine mapping, which emits only these keys (plus everything above) for
  // an unmapped "Cuisine / Category" segment.
  International: 'Internacional',
  Asian: 'Asiática',
  American: 'Americana',
  French: 'Francesa',
  Healthy: 'Saludable',
  Korean: 'Coreana',
  'Middle Eastern': 'Medio Oriente',
}
// EN shows the raw DB value (already English) — translation is a display
// concern only, so a language flip never touches what's written or filtered on.
export function cuisineLabel(cuisine: string | null | undefined): string | null {
  if (!cuisine) return null
  if (getLanguage() === 'en') return cuisine
  return CUISINE_ES[cuisine] ?? cuisine
}

// Occasion tags: the rank flow's own picker (OCCASION_TAGS below) writes
// Spanish values directly — that's the DB's write vocabulary, unchanged by
// this milestone (see OCCASION_TAGS's own comment). Legacy seed rows predate
// that picker and are stored English; TAG_ES normalizes those to the same
// canonical Spanish form first, so a restaurant's aggregated tag line never
// mixes languages regardless of which path wrote the row. TAG_EN then
// translates the canonical Spanish for an English reader — display only,
// which is why Explore's `occasion` filter param stays the Spanish value.
const TAG_ES: Record<string, string> = {
  'Date Night': 'Cena romántica',
  'Special Occasion': 'Ocasión especial',
  'Group Dinner': 'Cena en grupo',
  Outdoor: 'Al aire libre',
  'Fine Dining': 'Alta cocina',
  Casual: 'Informal',
  'Late Night': 'Trasnoche',
}
const TAG_EN: Record<string, string> = {
  'Cena romántica': 'Date night',
  'Ocasión especial': 'Special occasion',
  'Cena en grupo': 'Group dinner',
  'Al aire libre': 'Outdoors',
  Solo: 'Solo',
  'Alta cocina': 'Fine dining',
  Informal: 'Casual',
  Trasnoche: 'Late night',
}
export function tagLabel(tag: string): string {
  const canonical = TAG_ES[tag] ?? tag
  if (getLanguage() === 'en') return TAG_EN[canonical] ?? canonical
  return canonical
}

// The occasion picker in the rank flow's note step (B4). Spanish, matching the
// seed vocabulary exactly (packages/db/src/seed-extra.ts's TAGS) — this is a
// controlled vocabulary kept in lockstep by hand across the two copies, not by
// an API enum, so a restaurant's aggregated tags never mix a client build that
// lags a seed change. If you add a value here, add it to seed-extra.ts's TAGS
// too (and vice versa).
export const OCCASION_TAGS = [
  'Cena romántica',
  'Ocasión especial',
  'Cena en grupo',
  'Al aire libre',
  'Solo',
  'Alta cocina',
  'Informal',
  'Trasnoche',
]

// Dish-photo grain treatment — shown as a "film · <grain>" tag and as a
// picker chip label (DishCompose, and the inline photo step in the rank flow).
const GRAIN_LABEL_ES: Record<string, string> = {
  candlelit: 'Con velas',
  daylight: 'Luz de día',
  none: 'Ninguno',
}
const GRAIN_LABEL_EN: Record<string, string> = {
  candlelit: 'Candlelit',
  daylight: 'Daylight',
  none: 'None',
}
export function grainLabel(grain: string | null | undefined): string {
  const dict = getLanguage() === 'en' ? GRAIN_LABEL_EN : GRAIN_LABEL_ES
  return dict[grain ?? 'candlelit'] ?? grain ?? dict.candlelit
}

// M15 — the byline on a curated list's card and detail page: "por Mesa" for
// the editorial team (the schema default, no name/handle needed), "por
// @handle" for a creator/venue that has one, falling back to the bare name
// for a venue byline like "Comedor Doña Chana" that has no handle at all.
export function listAuthorLabel(list: {
  authorKind: 'mesa' | 'creator' | 'venue'
  authorName: string | null
  authorHandle: string | null
}): string {
  const by = getLanguage() === 'en' ? 'by' : 'por'
  if (list.authorKind !== 'mesa') {
    if (list.authorHandle) return `${by} @${list.authorHandle}`
    if (list.authorName) return `${by} ${list.authorName}`
  }
  return `${by} Mesa`
}

export type Grain = 'candlelit' | 'daylight' | 'none'
// A function, not a static list: the label has to reflect whichever language
// is current at render time, and the caller already re-renders on a language
// flip (every screen that shows this picker subscribes via useT()/useLanguage()
// for its own strings).
export function grainOptions(): { value: Grain; label: string }[] {
  return [
    { value: 'candlelit', label: grainLabel('candlelit') },
    { value: 'daylight', label: grainLabel('daylight') },
    { value: 'none', label: grainLabel('none') },
  ]
}

// Events' curated Spanish descriptors (category, price line), in the app's
// language — see lib/eventCategory.ts. Titles are left as the venue wrote them.
export function eventCategoryLabel(category: string | null): string | null {
  return eventCategoryText(category, getLanguage())
}
export function eventPriceLabel(label: string | null): string | null {
  return eventPriceText(label, getLanguage())
}
