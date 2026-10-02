import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { toast } from '@/components/ui/toast-store'
import { ApiError, api } from '@/lib/api'
import { dedupeExternal } from '@/lib/dedupeExternal'
import { useT } from '@/lib/i18n'
import type {
  ExploreHit,
  ExternalSearchResponse,
  ExternalSuggestion,
  NewRestaurant,
  SearchWhere,
} from '@/lib/types'
import { useDebounced } from '@/lib/useDebounced'
import { useGoogleSession } from '@/lib/useGoogleSession'

// Google place search, once — shared by Explore and the rank flow's find step
// (the two copies had drifted, hiding the "search a place you already ranked,
// get its Google copy" bug). Owns the debounce, the session token, the catalog
// dedupe, and the create-on-tap mutation. Only what happens after a place is
// created differs per screen, so `onCreated` stays with the caller. Ported from
// apps/app/src/lib/useExternalPlaceSearch.ts.
//
// Every query of 3+ characters asks Google, by founder's call: the search bar is meant to find
// ANY restaurant, anywhere — Santo Domingo first, then the rest of the Dominican Republic, then
// the world (the API does the ordering; `where` only narrows how far down it goes) — not to fill
// gaps in Mesa's own catalog. That replaces a `mesaResultCount < 3` gate which made Google
// results nearly unreachable in practice — Explore counted matching *members* toward the
// threshold too, so three people matching your query suppressed every restaurant Google would
// have returned. Spend stays bounded by the 300ms debounce and 5-minute cache below, the
// server's per-user rate limit (extRateLimited in routes/restaurants.ts), and the fact that
// autocomplete is on Google's cheapest field-masked SKU — Details is still only ever fetched
// when someone actually taps a suggestion. (The widest scope asks Google three times per
// search; see apps/api/src/lib/placeSearch.ts.)
export function useExternalPlaceSearch(opts: {
  query: string
  catalogNames: string[]
  onCreated: (restaurant: NewRestaurant) => void
}): {
  suggestions: ExternalSuggestion[]
  // Places Google found that Mesa already has: shown among Mesa's own results, not under "En Google".
  inMesa: ExploreHit[]
  create: (placeId: string) => void
  creatingId: string | null
  // The scope pills: how far the search looks, whether there is a search to scope at all (3+
  // characters), and whether Google itself came back empty. Not the same as `suggestions` being
  // empty: those are deduped against what Mesa already shows, so every Google result can be one
  // you already see above.
  where: SearchWhere
  setWhere: (where: SearchWhere) => void
  active: boolean
  nothingFound: boolean
} {
  const { query, catalogNames, onCreated } = opts
  const t = useT()
  const queryClient = useQueryClient()
  const session = useGoogleSession()

  const debounced = useDebounced(query.trim(), 300)
  const wantExternal = debounced.length >= 3
  // Per screen and per visit: a scope is a choice about THIS search, not a setting.
  const [where, setWhere] = useState<SearchWhere>('world')

  const external = useQuery({
    queryKey: ['search-external', debounced, where],
    queryFn: () =>
      api.get<ExternalSearchResponse>(
        `/restaurants/search-external?q=${encodeURIComponent(debounced)}&where=${where}&s=${session.token}`,
      ),
    enabled: wantExternal,
    staleTime: 300_000,
  })
  const suggestions = wantExternal
    ? dedupeExternal(external.data?.suggestions ?? [], catalogNames)
    : []
  // (`?? []`: an API that predates `inMesa` simply has none.)
  const inMesa = wantExternal ? (external.data?.inMesa ?? []) : []

  const create = useMutation({
    mutationFn: (placeId: string) =>
      api.post<{ restaurant: NewRestaurant }>('/restaurants/from-google', {
        placeId,
        sessionToken: session.token,
      }),
    onSuccess: ({ restaurant }) => {
      session.reset()
      queryClient.invalidateQueries({ queryKey: ['explore'] })
      onCreated(restaurant)
    },
    onError: (err) => {
      const status = err instanceof ApiError ? err.status : null
      toast({
        variant: 'error',
        message:
          status === 429
            ? t('rank.add_place_capped')
            : status === 409
              ? t('rank.add_place_closed')
              : t('rank.add_place_connection_error'),
      })
    },
  })

  return {
    suggestions,
    inMesa,
    create: create.mutate,
    creatingId: create.isPending ? (create.variables ?? null) : null,
    where,
    setWhere,
    active: wantExternal,
    nothingFound:
      wantExternal &&
      external.isSuccess &&
      external.data.suggestions.length === 0 &&
      (external.data.inMesa ?? []).length === 0,
  }
}
