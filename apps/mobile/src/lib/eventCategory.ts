// Event categories → one of five warm hues (theme/vars.ts `--cat-*`, Eventos
// only). `events.category` is free curated text ("Cata de cócteles",
// "Música en vivo"…), so this normalizes it by keyword; anything unrecognized
// falls back to Mesa's brass. Pure (no RN imports) so it's unit-tested
// alongside the other lib/*.test.ts files.

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

// Literal class strings (not built by concatenation) so Tailwind/NativeWind
// sees and generates every one of them.
export const CAT_CLASSES: Record<
  CatKey,
  { bg: string; soft: string; text: string; border: string }
> = {
  cata: {
    bg: 'bg-cat-cata',
    soft: 'bg-cat-cata-soft',
    text: 'text-cat-cata',
    border: 'border-cat-cata',
  },
  musica: {
    bg: 'bg-cat-musica',
    soft: 'bg-cat-musica-soft',
    text: 'text-cat-musica',
    border: 'border-cat-musica',
  },
  brunch: {
    bg: 'bg-cat-brunch',
    soft: 'bg-cat-brunch-soft',
    text: 'text-cat-brunch',
    border: 'border-cat-brunch',
  },
  food: {
    bg: 'bg-cat-food',
    soft: 'bg-cat-food-soft',
    text: 'text-cat-food',
    border: 'border-cat-food',
  },
  happy: {
    bg: 'bg-cat-happy',
    soft: 'bg-cat-happy-soft',
    text: 'text-cat-happy',
    border: 'border-cat-happy',
  },
  default: {
    bg: 'bg-accent-fill',
    soft: 'bg-bg-sunk',
    text: 'text-accent-strong',
    border: 'border-accent',
  },
}

// The color token (for SVG strokes / Animated colors, via useColor).
export const CAT_TOKEN = {
  cata: 'cat-cata',
  musica: 'cat-musica',
  brunch: 'cat-brunch',
  food: 'cat-food',
  happy: 'cat-happy',
  default: 'accent',
} as const satisfies Record<CatKey, string>

// Filter order for the chips row.
export const CAT_ORDER: Exclude<CatKey, 'default'>[] = ['cata', 'food', 'musica', 'brunch', 'happy']
