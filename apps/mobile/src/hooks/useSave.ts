import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'

import { toast } from '@/components/ui/toast-store'
import { track } from '@/lib/analytics'
import { api } from '@/lib/api'
import { useT } from '@/lib/i18n'
import type { FeedItem } from '@/lib/types'

// The one save/unsave implementation (M19) — same optimistic-toggle-with-
// rollback shape as useFollow.ts, generalized over the two things a member
// can save: a restaurant (master list saved_places) or a dish
// (saved_dishes). See that hook's own header for why `initial` re-syncs
// through a `pendingRef` guard instead of a plain effect dependency.
export type SaveTarget = { kind: 'restaurant'; id: string } | { kind: 'dish'; id: string }

// Not 'feed': refetching every loaded feed page re-rendered every card and
// hitched the scroll right after the tap. The feed is patched in place instead
// (patchFeed below), the same way CheersButton handles a cheer.
const RELATED_QUERY_KEYS = ['saved', 'saved-dishes', 'collections'] as const

type FeedPages = { pages: { feed: FeedItem[]; nextCursor: string | null }[] }

export function useSave(target: SaveTarget, initial: boolean) {
  const t = useT()
  const [saved, setSaved] = useState(initial)
  const queryClient = useQueryClient()
  const pendingRef = useRef(false)

  const base = target.kind === 'restaurant' ? '/saved' : '/saved/dishes'
  const idField = target.kind === 'restaurant' ? 'restaurantId' : 'dishId'

  const patchFeed = (next: boolean) =>
    queryClient.setQueriesData<FeedPages>({ queryKey: ['feed'] }, (data) =>
      data
        ? {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              feed: page.feed.map((item) =>
                target.kind === 'restaurant' && item.restaurant.id === target.id
                  ? { ...item, restaurantSaved: next }
                  : target.kind === 'dish' && item.dishId === target.id
                    ? { ...item, dishSaved: next }
                    : item,
              ),
            })),
          }
        : data,
    )

  // What the member last asked for, and what the server last confirmed. A tap
  // while a request is in flight is never dropped: it just updates `wanted`,
  // and the settle handler sends one more request if the two disagree (the
  // old `disabled={pending}` silently ate a quick second tap to undo).
  const wanted = useRef(initial)
  const confirmed = useRef(initial)

  const mutation = useMutation({
    mutationFn: (next: boolean) =>
      next ? api.post(base, { [idField]: target.id }) : api.del(`${base}/${target.id}`),
    onSuccess: (_data, next) => {
      confirmed.current = next
      track(
        target.kind === 'restaurant'
          ? next
            ? 'place_saved'
            : 'place_unsaved'
          : next
            ? 'dish_saved'
            : 'dish_unsaved',
      )
      patchFeed(next)
      for (const key of RELATED_QUERY_KEYS) queryClient.invalidateQueries({ queryKey: [key] })
      queryClient.invalidateQueries({ queryKey: ['restaurant', target.id] })
      queryClient.invalidateQueries({ queryKey: ['dish', target.id] })
    },
    onError: (_err, next) => {
      // Roll back to what the server last confirmed — the request never landed.
      wanted.current = confirmed.current
      setSaved(confirmed.current)
      toast({ variant: 'error', message: next ? t('save.error') : t('save.unsave_error') })
    },
    onSettled: () => {
      if (wanted.current !== confirmed.current) {
        mutation.mutate(wanted.current)
        return
      }
      pendingRef.current = false
    },
  })

  useEffect(() => {
    if (!pendingRef.current) {
      setSaved(initial)
      wanted.current = initial
      confirmed.current = initial
    }
  }, [initial])

  const toggle = () => {
    pendingRef.current = true
    const next = !wanted.current
    wanted.current = next
    setSaved(next)
    if (!mutation.isPending) mutation.mutate(next)
  }

  return { saved, toggle, pending: mutation.isPending }
}
