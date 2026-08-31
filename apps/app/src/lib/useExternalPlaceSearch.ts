import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from '../components/ui/toast-store'
import { ApiError, api } from './api'
import { dedupeExternal } from './dedupeExternal'
import type { ExternalSuggestion, NewRestaurant } from './types'
import { useDebounced } from './useDebounced'
import { useGoogleSession } from './useGoogleSession'

// The Google gap-filler, once — it was implemented near-identically on Explore
// and in the rank flow's find step, and the two copies had already drifted
// (different dedupe inputs), which is exactly how the "search Olivia, get the
// Google copy of a place you already ranked" class of bug hid. This owns the
// debounce, the <3-Mesa-results gate, the session token, the dedupe against the
// catalog, and the create-on-tap mutation (request + error copy). The only
// thing that differs per screen — what happens after a place is created — is
// the `onCreated` callback (Explore navigates to it; the rank flow continues
// the ranking with it), so that stays with the caller.
export function useExternalPlaceSearch(opts: {
  query: string
  // How many Mesa results are already showing. The gap-filler only fires when
  // the catalog came up short (<3), so it never competes with real Mesa data.
  mesaResultCount: number
  // Names already on screen from the catalog — a suggestion that matches one is
  // hidden (dedupeExternal), so a place you have isn't re-offered as "new".
  catalogNames: string[]
  onCreated: (restaurant: NewRestaurant) => void
}): {
  suggestions: ExternalSuggestion[]
  create: (placeId: string) => void
  creatingId: string | null
} {
  const { query, mesaResultCount, catalogNames, onCreated } = opts
  const queryClient = useQueryClient()
  const session = useGoogleSession()

  const debounced = useDebounced(query.trim(), 300)
  const wantExternal = debounced.length >= 3 && mesaResultCount < 3

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
            ? 'Llegaste al límite de lugares por hoy.'
            : status === 409
              ? 'Google dice que este lugar cerró permanentemente.'
              : 'No se pudo conectar con Google. Intenta de nuevo.',
      })
    },
  })

  return {
    suggestions,
    create: create.mutate,
    creatingId: create.isPending ? (create.variables ?? null) : null,
  }
}
