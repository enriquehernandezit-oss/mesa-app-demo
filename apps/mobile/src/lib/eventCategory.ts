// Event categories → one of five kinds, each with its own icon (CAT_ICON below). `events.category`
// is free curated text ("Cata de cócteles", "Música en vivo"…), so this normalizes it by keyword;
// anything unrecognized is 'default'. Pure (no RN imports) so it's unit-tested alongside the other
// lib/*.test.ts files.

export type CatKey = 'cata' | 'musica' | 'brunch' | 'food' | 'happy' | 'default'

const RULES: [CatKey, RegExp][] = [
  ['happy', /happy|2x1|after ?work/],
  ['cata', /cata|tasting de vino|wine|whisk|c[oó]ctel|cocktail|sake|mezcal|ron\b/],
  ['musica', /m[uú]sica|music|jazz|dj|live|en vivo|concierto|karaoke|sessions?/],
  ['brunch', /brunch|desayuno|breakfast/],
  ['food', /food|omakase|tasting|men[uú] degustaci|degustaci|chef|cena|dinner|pop.?up/],
]

const ACCENTS: Record<string, string> = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u', ñ: 'n' }
function norm(s: string): string {
  return s.toLowerCase().replace(/[áéíóúüñ]/g, (ch) => ACCENTS[ch] ?? ch)
}

// The curated category decides; the title is only a fallback when the
// category says nothing recognizable — "Brunch + DJ Set" filed under Brunch
// is a brunch, not a DJ night.
export function categoryKey(category: string | null, title?: string | null): CatKey {
  for (const hay of [category, title]) {
    if (!hay) continue
    const n = norm(hay)
    for (const [key, re] of RULES) if (re.test(n)) return key
  }
  return 'default'
}

// Kinds are told apart by ICON, never by colour (docs/DESIGN.md: one burgundy accent, no rainbow).
// Names, not components, so this stays pure and unit-tested; components/events/EventTicket's
// CategoryIcon maps each name to its stroke icon.
export type CatIcon = 'wine' | 'music' | 'sun' | 'fork' | 'cocktail' | 'sparkle'
export const CAT_ICON: Record<CatKey, CatIcon> = {
  cata: 'wine',
  musica: 'music',
  brunch: 'sun',
  food: 'fork',
  happy: 'cocktail',
  default: 'sparkle',
}

// Filter order for the chips row.
export const CAT_ORDER: Exclude<CatKey, 'default'>[] = ['cata', 'food', 'musica', 'brunch', 'happy']

// Events are curated in Spanish (`events.category`, `events.price_label` are
// free text in apps/api/data/events.json). Titles stay as the venue named
// them, but the category and the price line are Mesa's own descriptors, so in
// English they're translated — known phrases first, then the recurring
// fragments ("por persona", "incluido"). Anything unrecognized passes
// through unchanged rather than guessing.
const CATEGORY_EN: Record<string, string> = {
  'musica en vivo': 'Live music',
  musica: 'Music',
  cata: 'Tasting',
  'cata de cocteles': 'Cocktail tasting',
  'cata de vinos': 'Wine tasting',
  especial: 'Special',
  desayuno: 'Breakfast',
  cena: 'Dinner',
  'noche de karaoke': 'Karaoke night',
  degustacion: 'Tasting menu',
  'menu degustacion': 'Tasting menu',
}

export function eventCategoryText(category: string | null, lang: 'es' | 'en'): string | null {
  if (!category || lang === 'es') return category
  return CATEGORY_EN[norm(category.trim())] ?? category
}

const PRICE_EN: [RegExp, string][] = [
  [/^entrada libre$/i, 'Free entry'],
  [/^gratis con reservaci[oó]n$/i, 'Free with reservation'],
  [/^gratis$/i, 'Free'],
  [/2x1 en c[oó]cteles/i, '2-for-1 cocktails'],
  [/2x1 en/i, '2-for-1'],
  [/men[uú] fijo/i, 'Set menu'],
  [/por persona/i, 'per person'],
  [/\bincluid[oa]s?\b/i, 'included'],
  [/con reservaci[oó]n/i, 'with reservation'],
  [/entrada/i, 'Entry'],
]

export function eventPriceText(label: string | null, lang: 'es' | 'en'): string | null {
  if (!label || lang === 'es') return label
  let out = label
  for (const [re, en] of PRICE_EN) out = out.replace(re, en)
  return out
}
