// Which sector chips a picker shows. With ~21 sectors a wall of chips buries the one you want, so a
// picker starts short — your choice(s) first, then the first few — and a search narrows it live.
// Pure, so the rules are unit tested.
export type Sector = { slug: string; name: string }

const COMBINING_MARKS = /\p{M}/gu
const norm = (s: string) => s.normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase().trim()

// How many chips show before "see all".
export const COLLAPSED_COUNT = 8

export function shownSectors(
  sectors: Sector[],
  selected: ReadonlySet<string>,
  query: string,
  expanded: boolean,
): { shown: Sector[]; hidden: number } {
  const q = norm(query)
  const matches = q ? sectors.filter((s) => norm(s.name).includes(q)) : sectors
  // Chosen sectors lead, so what you picked is never scrolled out of sight.
  const ordered = [
    ...matches.filter((s) => selected.has(s.slug)),
    ...matches.filter((s) => !selected.has(s.slug)),
  ]
  // A search shows every match; otherwise only the first few until "see all".
  if (q || expanded) return { shown: ordered, hidden: 0 }
  return {
    shown: ordered.slice(0, COLLAPSED_COUNT),
    hidden: Math.max(0, ordered.length - COLLAPSED_COUNT),
  }
}
