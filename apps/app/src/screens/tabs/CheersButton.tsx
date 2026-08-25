import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { HeartFilledIcon, HeartIcon } from '../../components/ui/icons'
import { api } from '../../lib/api'
import { tapLight } from '../../lib/haptics'
import './feed.css'

// The heart — the one-tap reaction on a feed item (was 🥂; see DESIGN.md
// Iconography). Optimistic with a pop animation; both API calls are
// idempotent so a rapid toggle can't drift.
export function CheersButton({
  rankingId,
  count,
  cheered,
}: {
  rankingId: string
  count: number
  cheered: boolean
}) {
  const [on, setOn] = useState(cheered)
  const [n, setN] = useState(count)
  const [popping, setPopping] = useState(false)

  const toggle = useMutation({
    mutationFn: (next: boolean) =>
      next ? api.post(`/cheers/${rankingId}`) : api.del(`/cheers/${rankingId}`),
    // Roll the optimistic state back if the write fails, so the button never
    // shows a cheer the server didn't record.
    onError: (_err, next) => {
      setOn(!next)
      setN((cur) => cur + (next ? -1 : 1))
    },
  })

  function onTap() {
    const next = !on
    setOn(next)
    setN((cur) => cur + (next ? 1 : -1))
    if (next) {
      setPopping(true)
      tapLight()
      setTimeout(() => setPopping(false), 450)
    }
    toggle.mutate(next)
  }

  return (
    <button
      type="button"
      className={`cheers${on ? ' cheers--on' : ''}${popping ? ' cheers--pop' : ''}`}
      onClick={onTap}
      aria-label={on ? 'Quitar brindis' : 'Brindar'}
    >
      <span className="cheers__icon">
        {on ? <HeartFilledIcon size={15} /> : <HeartIcon size={15} />}
      </span>
      {n > 0 && <span className="cheers__count">{n}</span>}
    </button>
  )
}
