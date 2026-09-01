import type { ExternalSuggestion } from './types'

// Lowercase, strip accents, collapse whitespace — the client-side echo of the
// server's mesa_norm(). Ported verbatim from apps/app/src/lib/dedupeExternal.ts.
function norm(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

// Drops Google suggestions for a place the catalog already surfaced, so a spot
// you added isn't re-offered under "En Google" as if it were new. Mirrors the
// server's containment dedup with a ≥5-char floor so a generic token can't
// erase the list.
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
