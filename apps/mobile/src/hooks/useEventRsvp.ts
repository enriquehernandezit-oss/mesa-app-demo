import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'

import { toast } from '@/components/ui/toast-store'
import { ApiError, api } from '@/lib/api'
import { captureError } from '@/lib/errors'
import { tapLight, tapSuccess } from '@/lib/haptics'
import { useT } from '@/lib/i18n'
import type { EventSummary } from '@/lib/types'

type Rsvp = EventSummary['myRsvp']

// One optimistic RSVP for an event — shared by the ticket card, the hero
// card and the detail page so all three flip instantly and agree. Same
// shape as useSave/useFollow: local state flips on tap, rolls back on error,
// and re-syncs from the server value only while nothing is in flight.
// Tapping the active status clears it ("tap again to undo").
export function useEventRsvp(e: EventSummary) {
  const t = useT()
  const queryClient = useQueryClient()
  const [rsvp, setRsvp] = useState<Rsvp>(e.myRsvp)
  const pendingRef = useRef(false)
  useEffect(() => {
    if (!pendingRef.current) setRsvp(e.myRsvp)
  }, [e.myRsvp])

  const mutation = useMutation({
    mutationFn: (next: Rsvp) =>
      next ? api.put(`/events/${e.id}/rsvp`, { status: next }) : api.del(`/events/${e.id}/rsvp`),
    onError: (err, _next, ctx) => {
      captureError(err, 'events.rsvp')
      setRsvp((ctx as { prev: Rsvp } | undefined)?.prev ?? e.myRsvp)
      // 409: the last spot went while this screen was open — say so, rather than a vague failure.
      const full = err instanceof ApiError && err.status === 409
      toast({ variant: 'error', message: t(full ? 'events.rsvp_full' : 'events.rsvp_error') })
    },
    onMutate: () => ({ prev: rsvp }),
    onSettled: () => {
      pendingRef.current = false
      queryClient.invalidateQueries({ queryKey: ['events'] })
      queryClient.invalidateQueries({ queryKey: ['event', e.id] })
      // Tonight's card on the Feed carries the member's own RSVP.
      queryClient.invalidateQueries({ queryKey: ['home'] })
    },
  })

  const toggle = (status: 'going' | 'interested') => {
    if (mutation.isPending) return
    const next: Rsvp = rsvp === status ? null : status
    pendingRef.current = true
    setRsvp(next)
    if (next === 'going') tapSuccess()
    else tapLight()
    mutation.mutate(next)
  }

  // The going count as the viewer sees it right now — the server count,
  // adjusted by however this tap moved it before the refetch lands.
  const delta = (rsvp === 'going' ? 1 : 0) - (e.myRsvp === 'going' ? 1 : 0)
  const goingCount = Math.max(0, e.goingCount + delta)
  const spotsLeft = e.capacity != null ? Math.max(0, e.capacity - goingCount) : null

  return { rsvp, toggle, goingCount, spotsLeft, pending: mutation.isPending }
}
