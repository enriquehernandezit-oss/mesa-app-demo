import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'

import { toast } from '@/components/ui/toast-store'
import { api } from '@/lib/api'
import { captureError } from '@/lib/errors'
import { tapLight } from '@/lib/haptics'
import { useT } from '@/lib/i18n'
import type { EventSummary } from '@/lib/types'

// Save / unsave an event into the member's Saved → Events. A plain bookmark,
// separate from the RSVP (you can be going AND have it saved), and never
// offered for custom lists — an event isn't something you collect into one.
// Same optimistic shape as useSave: the bookmark flips on tap, a tap while a
// request is in flight is queued (never dropped), and a failure rolls back to
// what the server last confirmed.
export function useEventSave(e: EventSummary) {
  const t = useT()
  const queryClient = useQueryClient()
  const initial = Boolean(e.savedByMe)
  const [saved, setSaved] = useState(initial)
  const wanted = useRef(initial)
  const confirmed = useRef(initial)
  const pendingRef = useRef(false)
  useEffect(() => {
    if (pendingRef.current) return
    setSaved(initial)
    wanted.current = initial
    confirmed.current = initial
  }, [initial])

  const mutation = useMutation({
    mutationFn: (next: boolean) =>
      next ? api.put(`/events/${e.id}/save`) : api.del(`/events/${e.id}/save`),
    onSuccess: (_d, next) => {
      confirmed.current = next
    },
    onError: (err) => {
      captureError(err, 'events.save')
      wanted.current = confirmed.current
      setSaved(confirmed.current)
      toast({ variant: 'error', message: t('events.save_error') })
    },
    onSettled: () => {
      if (wanted.current !== confirmed.current) {
        mutation.mutate(wanted.current)
        return
      }
      pendingRef.current = false
      queryClient.invalidateQueries({ queryKey: ['events'] })
      queryClient.invalidateQueries({ queryKey: ['event', e.id] })
    },
  })

  const toggle = () => {
    const next = !wanted.current
    wanted.current = next
    pendingRef.current = true
    setSaved(next)
    tapLight()
    if (next) toast({ message: t('events.saved_toast') })
    if (!mutation.isPending) mutation.mutate(next)
  }

  return { saved, toggle }
}
