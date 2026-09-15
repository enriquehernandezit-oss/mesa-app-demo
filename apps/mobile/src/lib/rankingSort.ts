import { cuisineLabel, priceLabel, tagLabel } from '@/lib/display'
import { dateLocale, getLanguage, t } from '@/lib/i18n'
import type { Ranking } from '@/lib/types'

// Sort + filter for the "mine" tab of the rankings screen. Pure functions over a
// list already in memory — the list is one person's own and never paginated
// (see the comment on GET /rankings), so this all runs on the client.

export type SortKey = 'position' | 'score' | 'recent' | 'name'

// Not a component — reads the language directly via t()/getLanguage(), same as
// lib/authErrors.ts, since sort options are consumed by plain callers as well
// as components.
export function sortOptions(): { key: SortKey; label: string }[] {
  const lang = getLanguage()
  return [
    { key: 'position', label: t(lang, 'rankings.sort_position') },
    { key: 'score', label: t(lang, 'rankings.sort_score') },
    { key: 'recent', label: t(lang, 'rankings.sort_recent') },
    { key: 'name', label: t(lang, 'rankings.sort_name') },
  ]
}

export function sortLabel(key: SortKey): string {
  return (
    sortOptions().find((o) => o.key === key)?.label ?? t(getLanguage(), 'rankings.sort_position')
  )
}

export function sortRankings(rows: Ranking[], key: SortKey): Ranking[] {
  const out = [...rows]
  switch (key) {
    case 'score':
      // Best first; ties fall back to the settled order so it's stable.
      return out.sort((a, b) => b.score - a.score || a.position - b.position)
    case 'recent':
      // Newest first. createdAt is ISO, so a string compare is chronological;
      // rows without it (shouldn't happen on the own list) sink to the bottom.
      return out.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
    case 'name':
      return out.sort((a, b) =>
        a.restaurant.name.localeCompare(b.restaurant.name, dateLocale(), { sensitivity: 'base' }),
      )
    default:
      // 'position' — the pairwise order, which is the list's real identity.
      return out.sort((a, b) => a.position - b.position)
  }
}

export type RankingFilters = {
  sector: string | null
  occasion: string | null
  price: number | null
  cuisine: string | null
}

export const NO_FILTERS: RankingFilters = {
  sector: null,
  occasion: null,
  price: null,
  cuisine: null,
}

export function activeFilterCount(f: RankingFilters): number {
  return [f.sector, f.occasion, f.price, f.cuisine].filter((v) => v != null).length
}

export function applyFilters(rows: Ranking[], f: RankingFilters): Ranking[] {
  return rows.filter((r) => {
    if (f.sector && r.neighborhood !== f.sector) return false
    if (f.occasion && !(r.tags ?? []).includes(f.occasion)) return false
    if (f.price && r.restaurant.priceTier !== f.price) return false
    if (f.cuisine && r.restaurant.cuisine !== f.cuisine) return false
    return true
  })
}

// The set of values each dimension actually takes across the list — so a filter
// panel only ever offers options that would match something.
export type FilterOptions = {
  sectors: string[]
  occasions: string[]
  prices: number[]
  cuisines: string[]
}

export function deriveFilterOptions(rows: Ranking[]): FilterOptions {
  const sectors = new Set<string>()
  const occasions = new Set<string>()
  const prices = new Set<number>()
  const cuisines = new Set<string>()
  for (const r of rows) {
    if (r.neighborhood) sectors.add(r.neighborhood)
    for (const t of r.tags ?? []) occasions.add(t)
    if (r.restaurant.priceTier) prices.add(r.restaurant.priceTier)
    if (r.restaurant.cuisine) cuisines.add(r.restaurant.cuisine)
  }
  const locale = dateLocale()
  return {
    sectors: [...sectors].sort((a, b) => a.localeCompare(b, locale)),
    occasions: [...occasions].sort((a, b) => a.localeCompare(b, locale)),
    prices: [...prices].sort((a, b) => a - b),
    cuisines: [...cuisines].sort((a, b) => a.localeCompare(b, locale)),
  }
}

// Display label for one active filter's removable chip, e.g. "Piantini", "$$",
// "Italiana", or the occasion tag translated.
export function filterChipLabel(dim: keyof RankingFilters, value: string | number): string {
  if (dim === 'price') return priceLabel(Number(value)) ?? String(value)
  if (dim === 'cuisine') return cuisineLabel(String(value)) ?? String(value)
  if (dim === 'occasion') return tagLabel(String(value))
  return String(value)
}
