import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { toast } from '@/components/ui/toast-store'
import { ApiError, api } from '@/lib/api'
import { dedupeExternal } from '@/lib/dedupeExternal'
import { useT } from '@/lib/i18n'
import type { ExternalSuggestion, NewRestaurant } from '@/lib/types'
import { useDebounced } from '@/lib/useDebounced'
import { useGoogleSession } from '@/lib/useGoogleSession'

// Google place search, once — shared by Explore and the rank flow's find step
// (the two copies had drifted, hiding the "search a place you already ranked,
// get its Google copy" bug). Owns the debounce, the session token, the catalog
// dedupe, and the create-on-tap mutation. Only what happens after a place is
// created differs per screen, so `onCreated` stays with the caller. Ported from
// apps/app/src/lib/useExternalPlaceSearch.ts.
//
// Every query of 3+ characters asks Google, by founder's call: the search bar
// is meant to find ANY restaurant in the DR, not to fill gaps in Mesa's own
// catalog. That replaces a `mesaResultCount < 3` gate which made Google results
// nearly unreachable in practice — Explore counted matching *members* toward
// the threshold too, so three people matching your query suppressed every
// restaurant Google would have returned. Spend stays bounded by the 300ms
// debounce and 5-minute cache below, the server's per-user rate limit
// (extRateLimited in routes/restaurants.ts), and the fact that autocomplete is
// on Google's cheapest field-masked SKU — Details is still only ever fetched
// when someone actually taps a suggestion.
export function useExternalPlaceSearch(opts: {
  query: string
  catalogNames: string[]
  onCreated: (restaurant: NewRestaurant) => void
}): {
  suggestions: ExternalSuggestion[]
  create: (placeId: string) => void
  creatingId: string | null
} {
  const { query, catalogNames, onCreated } = opts
  const t = useT()
  const queryClient = useQueryClient()
  const session = useGoogleSession()

  const debounced = useDebounced(query.trim(), 300)
  const wantExternal = debounced.length >= 3

  const external = useQuery({
    queryKey: ['search-external', debounced],
    queryFn: () =>
      api.get<{ suggestions: ExternalSuggestion[] }>(
        `/restaurants/search-external?q=${encodeURIComponent(debounced)}&s=${session.token}`,
      ),
    enabled: wantExternal,
    staleTime: 300_000,
  })
  const suggestions = wantExternal
    ? dedupeExternal(external.data?.suggestions ?? [], catalogNames)
    : []

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
    create: create.mutate,
    creatingId: create.isPending ? (create.variables ?? null) : null,
  }
}
