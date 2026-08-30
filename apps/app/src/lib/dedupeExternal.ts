import type { ExternalSuggestion } from './types'

// Lowercase, strip accents, collapse whitespace — the client-side echo of the
// server's mesa_norm(), so "Bruma del Malecón" and "bruma del malecon" compare
// equal. Only used for the loose "is this the same place" check below.
function norm(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

// Drops Google suggestions for a place the catalog already surfaced, so a spot
// you added (and maybe ranked) isn't re-offered under "En Google" as if it were
// new — the confusing half of the duplicate-profile bug. Mirrors the server's
// containment dedup (findGooglePlaceMatch): a suggestion is hidden when its
// name and a shown result's name contain one another ("Bruma" vs "Bruma del
// Malecón"), with a ≥5-char floor so a generic token can't erase the list.
// The server still dedups on tap; this only spares the member the confusion
// (and a wasted Place Details call).
export function dedupeExternal(
  suggestions: ExternalSuggestion[],
  catalogNames: string[],
): ExternalSuggestion[] {
  const known = catalogNames.map(norm).filter(Boolean)
  return suggestions.filter((s) => {
    const name = norm(s.name)
    if (name.length < 5) return true // too generic to match on confidently
    return !known.some((k) => k.length >= 5 && (k.includes(name) || name.includes(k)))
  })
}
