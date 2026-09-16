// Mirror of packages/db/src/dishCategories.ts's keyword-guess matcher ONLY —
// Metro can't import a workspace package under Bun's isolated linker (see
// CLAUDE.md's repo-shape note), so the actual taxonomy data lives on the
// server (GET /dishes/categories) and is fetched, never duplicated here.
// Keep this matcher's logic identical to the server's if either changes —
// it's used purely for an instant client-side guess while the categories
// query is in flight or to pre-select a chip; the server is always the
// source of truth for what's actually stored.
import type { DishCategory, DishGroup } from '@/lib/types'
import { en } from '@/locales/en'
import { es } from '@/locales/es'
import { useQuery } from '@tanstack/react-query'
import { api } from './api'
import type { Lang } from './i18n'

export function mesaNorm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
}

function keywordRegex(keyword: string): RegExp {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`\\b${escaped}(?:es|s)?\\b`, 'i')
}

/** Guess a dish's category from its name — see the server-side matcher's doc
 * comment (packages/db/src/dishCategories.ts) for the exact rule. */
export function guessDishCategory(name: string, categories: DishCategory[]): string {
  const normalized = mesaNorm(name)
  let best: { categoryId: string; sortOrder: number; length: number } | null = null

  for (const cat of categories) {
    for (const keyword of cat.keywords) {
      const normalizedKeyword = mesaNorm(keyword)
      if (!keywordRegex(normalizedKeyword).test(normalized)) continue
      const length = normalizedKeyword.length
      if (
        best === null ||
        length > best.length ||
        (length === best.length && cat.sortOrder < best.sortOrder)
      ) {
        best = { categoryId: cat.id, sortOrder: cat.sortOrder, length }
      }
    }
  }

  return best?.categoryId ?? 'otro'
}

// Categories/groups rarely change (they're a closed, migration-seeded list),
// so an hour of staleness costs nothing and saves a request on every rank
// flow and dish composer open.
export function useDishCategories() {
  return useQuery({
    queryKey: ['dish-categories'],
    queryFn: () =>
      api.get<{ groups: DishGroup[]; categories: DishCategory[] }>('/dishes/categories'),
    staleTime: 60 * 60 * 1000,
  })
}

type LabelDict = Record<string, string | { one: string; other: string }>

// Falls back to the server's own `nameEs` when the client's i18n dictionary
// doesn't have a `dish_category.<id>` / `dish_group.<id>` key yet — the real
// case this guards is a NEW category shipped server-side before the app is
// rebuilt with its translation, not a typo (both dictionaries are checked
// for completeness at compile time for every key that IS declared).
export function categoryLabel(category: DishCategory, lang: Lang): string {
  const dict: LabelDict = lang === 'es' ? es : en
  const entry = dict[`dish_category.${category.id}`]
  return typeof entry === 'string' ? entry : category.nameEs
}

export function groupLabel(group: DishGroup, lang: Lang): string {
  const dict: LabelDict = lang === 'es' ? es : en
  const entry = dict[`dish_group.${group.id}`]
  return typeof entry === 'string' ? entry : group.nameEs
}
