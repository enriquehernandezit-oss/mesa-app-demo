import { toast } from '@/components/ui/toast-store'
import { track } from '@/lib/analytics'
import { api } from '@/lib/api'
import { useT } from '@/lib/i18n'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'

// The one save/unsave implementation (M19) — same optimistic-toggle-with-
// rollback shape as useFollow.ts, generalized over the two things a member
// can save: a restaurant (master list saved_places) or a dish
// (saved_dishes). See that hook's own header for why `initial` re-syncs
// through a `pendingRef` guard instead of a plain effect dependency.
export type SaveTarget = { kind: 'restaurant'; id: string } | { kind: 'dish'; id: string }

const RELATED_QUERY_KEYS = ['feed', 'saved', 'saved-dishes', 'collections'] as const

export function useSave(target: SaveTarget, initial: boolean) {
  const t = useT()
  const [saved, setSaved] = useState(initial)
  const queryClient = useQueryClient()
  const pendingRef = useRef(false)

  const base = target.kind === 'restaurant' ? '/saved' : '/saved/dishes'
  const idField = target.kind === 'restaurant' ? 'restaurantId' : 'dishId'

  const mutation = useMutation({
    mutationFn: (next: boolean) =>
      next ? api.post(base, { [idField]: target.id }) : api.del(`${base}/${target.id}`),
    onSuccess: (_data, next) => {
      track(
        target.kind === 'restaurant'
          ? next
            ? 'place_saved'
            : 'place_unsaved'
          : next
            ? 'dish_saved'
            : 'dish_unsaved',
      )
      for (const key of RELATED_QUERY_KEYS) queryClient.invalidateQueries({ queryKey: [key] })
      queryClient.invalidateQueries({ queryKey: ['restaurant', target.id] })
      queryClient.invalidateQueries({ queryKey: ['dish', target.id] })
    },
    onError: (_err, next) => {
      // Roll back the optimistic flip — the request never landed.
      setSaved(!next)
      toast({ variant: 'error', message: next ? t('save.error') : t('save.unsave_error') })
    },
    onSettled: () => {
      pendingRef.current = false
    },
  })

  useEffect(() => {
    if (!pendingRef.current) setSaved(initial)
  }, [initial])

  const toggle = () => {
    if (mutation.isPending) return
    pendingRef.current = true
    const next = !saved
    setSaved(next)
    mutation.mutate(next)
  }

  return { saved, toggle, pending: mutation.isPending }
}
