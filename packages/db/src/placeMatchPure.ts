// Pure, in-process name/distance matching — no query, no I/O. Shared by
// import-foursquare.ts (M6) and import-top100.ts (M5), both of which dedup a
// bulk extract against the existing catalog in memory rather than one live
// query per candidate (CLAUDE.md hard rule 3 forbids per-row queries at
// import scale). apps/api/src/lib/placeMatch.ts mirrors the same two
// thresholds (exact-name ≤250m, trigram ≥0.55 ≤150m) for the single-candidate,
// live-query case (POST /restaurants) — keep the thresholds in sync.

// Haversine in meters, mirroring apps/mobile/src/lib/geo.ts — this package
// can't import from an app, so the formula lives here too.
export function haversineM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000
  const dLat = ((bLat - aLat) * Math.PI) / 180
  const dLng = ((bLng - aLng) * Math.PI) / 180
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)))
}

// Name normalization — mirrors mesa_norm() (migration 0008): lower + strip
// accents. unaccent and Unicode-NFD agree on the Spanish diacritics that
// appear in DR restaurant names (á é í ó ú ñ ü).
export function mesaNorm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
}

// pg_trgm similarity() faithfully — Jaccard over the two trigram SETS. The
// exact algorithm matters, verified against show_trgm(): pg_trgm splits on
// every non-alphanumeric char, pads EACH word with two leading + one trailing
// space, generates that word's trigrams, and unions (dedups) across words —
// it does NOT pad the whole string once (that would invent cross-word
// trigrams and mishandle a repeated word, e.g. "boga boga" must score 1.0
// against "boga", not 0.83). Inputs here are already mesaNorm'd (lowercased,
// accent-stripped), matching the live matcher's
// `similarity(name_key, mesa_norm(...))`, so the 0.55 threshold means the
// same thing on both sides.
function trigrams(s: string): Set<string> {
  const out = new Set<string>()
  for (const word of s.split(/[^a-z0-9]+/)) {
    if (!word) continue
    const padded = `  ${word} `
    for (let i = 0; i <= padded.length - 3; i++) out.add(padded.slice(i, i + 3))
  }
  return out
}
export function trigramSimilarity(a: string, b: string): number {
  const ta = trigrams(a)
  const tb = trigrams(b)
  if (ta.size === 0 || tb.size === 0) return 0
  let inter = 0
  for (const t of ta) if (tb.has(t)) inter++
  return inter / (ta.size + tb.size - inter)
}
