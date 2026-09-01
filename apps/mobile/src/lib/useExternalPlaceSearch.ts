import { toast } from '@/components/ui/toast-store'
import { ApiError, api } from '@/lib/api'
import { dedupeExternal } from '@/lib/dedupeExternal'
import type { ExternalSuggestion, NewRestaurant } from '@/lib/types'
import { useDebounced } from '@/lib/useDebounced'
import { useGoogleSession } from '@/lib/useGoogleSession'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

// The Google gap-filler, once — shared by Explore and the rank flow's find step
// (the two copies had drifted, hiding the "search a place you already ranked,
// get its Google copy" bug). Owns the debounce, the <3-Mesa-results gate, the
// session token, the catalog dedupe, and the create-on-tap mutation. Only what
// happens after a place is created differs per screen, so `onCreated` stays with
// the caller. Ported from apps/app/src/lib/useExternalPlaceSearch.ts.
export function useExternalPlaceSearch(opts: {
  query: string
  mesaResultCount: number
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
