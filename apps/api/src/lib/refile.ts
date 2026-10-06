// Re-filing places into Mesa's sectors from what Google already said (restaurants.google_sublocality),
// so adding sectors costs no new Google calls. Pure, so the rules are tested.
//
//   • A place whose Google sublocality names a sector (by name or alias, accents and case ignored) is
//     filed there, if it is not already.
//   • A place with no sublocality, or one that matches no sector, stays where it is. Never moved by
//     "nearest centroid": that is how places ended up in the wrong sector in the first place.
//   • Only places inside Santo Domingo are touched, and only ones under a listed sector — an area made
//     for a place elsewhere is never pulled into the city.

const COMBINING_MARKS = /\p{M}/gu
export const norm = (s: string): string =>
  s.normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase().trim()

export interface RefileSector {
  id: string
  name: string
  aliases: string[]
}
export interface RefileRow {
  id: string
  name: string
  neighborhoodId: string
  googleSublocality: string | null
}

// The sector a place's Google sublocality names, or null.
export function sectorForSublocality(
  sublocality: string | null,
  sectors: RefileSector[],
): RefileSector | null {
  if (!sublocality) return null
  const want = norm(sublocality)
  return (
    sectors.find((s) => norm(s.name) === want || s.aliases.some((a) => norm(a) === want)) ?? null
  )
}

export type Move = { row: RefileRow; to: RefileSector }

export function planRefile(
  rows: RefileRow[],
  sectors: RefileSector[],
): { moves: Move[]; unmatched: Map<string, number> } {
  const moves: Move[] = []
  const unmatched = new Map<string, number>()
  for (const row of rows) {
    if (!row.googleSublocality) continue
    const to = sectorForSublocality(row.googleSublocality, sectors)
    if (!to) {
      unmatched.set(row.googleSublocality, (unmatched.get(row.googleSublocality) ?? 0) + 1)
      continue
    }
    if (to.id !== row.neighborhoodId) moves.push({ row, to })
  }
  return { moves, unmatched }
}
