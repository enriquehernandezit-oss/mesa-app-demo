import { type PropsWithChildren, useRef, useState } from 'react'

// Touch pull-to-refresh for the feed (and any scrolling tab). Pure touch events
// — no library. When the page is scrolled to the top and the user drags down
// past the threshold, onRefresh runs and a brass spinner shows until it settles.
const THRESHOLD = 72
const MAX_PULL = THRESHOLD * 1.4
// A touch under this many px hasn't revealed its direction yet. Below this, a
// diagonal swipe that starts on a horizontal rail (e.g. "Listas destacadas")
// could get mis-read as a vertical pull; above it, dx vs dy decides the axis
// once for the rest of the gesture.
const AXIS_LOCK_PX = 8

type DragPhase = 'idle' | 'pending' | 'vertical' | 'horizontal'

export function PullToRefresh({
  onRefresh,
  children,
}: PropsWithChildren<{ onRefresh: () => Promise<unknown> }>) {
  const startX = useRef(0)
  const startY = useRef(0)
  const phase = useRef<DragPhase>('idle')
  const pull = useRef(0)
  const contentRef = useRef<HTMLDivElement>(null)
  const spinnerWrapRef = useRef<HTMLDivElement>(null)
  const spinnerRef = useRef<HTMLDivElement>(null)
  const [refreshing, setRefreshing] = useState(false)

  // Writes the drag position straight to the DOM instead of through React
  // state, so a rail swipe (or a pull) never re-renders the feed underneath
  // it — only transform/opacity change, and only on the three nodes that need
  // to move. `animated` toggles the settle transition on release.
  function applyPull(next: number, animated: boolean) {
    pull.current = next
    const settle = animated ? 'transform var(--dur-base) var(--ease-out)' : 'none'
    if (contentRef.current) {
      contentRef.current.style.transform = next ? `translateY(${next}px)` : ''
      contentRef.current.style.transition = settle
    }
    if (spinnerWrapRef.current) {
      spinnerWrapRef.current.style.transform = `translateY(${next - MAX_PULL}px)`
      spinnerWrapRef.current.style.transition = settle
    }
    if (spinnerRef.current) {
      spinnerRef.current.style.opacity = String(Math.min(next / THRESHOLD, 1))
      spinnerRef.current.style.transform = `rotate(${next * 3}deg)`
      spinnerRef.current.style.transition = animated
        ? 'opacity var(--dur-base) var(--ease-out)'
        : 'none'
    }
  }

  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length !== 1 || refreshing) {
      phase.current = 'idle'
      return
    }
    const t = e.touches[0]
    startX.current = t?.clientX ?? 0
    startY.current = t?.clientY ?? 0
    // Only a pull-to-refresh candidate when already at the top — a swipe
    // lower in the feed never enters "pending" at all.
    phase.current = window.scrollY <= 0 ? 'pending' : 'idle'
  }

  function onTouchMove(e: React.TouchEvent) {
    if (phase.current === 'idle' || e.touches.length !== 1) return
    const t = e.touches[0]
    const dx = (t?.clientX ?? 0) - startX.current
    const dy = (t?.clientY ?? 0) - startY.current

    if (phase.current === 'pending') {
      if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) return
      // Decided once for the rest of this gesture. Horizontal releases the
      // page entirely — this is the fix for the reported bug: swiping the
      // rail sideways no longer also drags the feed down.
      phase.current = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical'
    }
    if (phase.current !== 'vertical') return

    applyPull(dy > 0 ? Math.min(dy / 2, MAX_PULL) : 0, false)
  }

  async function finishDrag() {
    const wasVertical = phase.current === 'vertical'
    phase.current = 'idle'
    if (!wasVertical) return
    const releasedAt = pull.current
    if (releasedAt >= THRESHOLD) {
      setRefreshing(true)
      applyPull(THRESHOLD * 0.75, true)
      try {
        await onRefresh()
      } finally {
        setRefreshing(false)
        applyPull(0, true)
      }
    } else {
      applyPull(0, true)
    }
  }

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={finishDrag}
      onTouchCancel={finishDrag}
      style={{ position: 'relative' }}
    >
      <div
        ref={spinnerWrapRef}
        aria-hidden
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: MAX_PULL,
          display: 'grid',
          placeItems: 'center',
          transform: `translateY(${-MAX_PULL}px)`,
          pointerEvents: 'none',
        }}
      >
        <div
          ref={spinnerRef}
          style={{
            width: 22,
            height: 22,
            borderRadius: '50%',
            border: '2px solid var(--line)',
            borderTopColor: 'var(--accent)',
            opacity: 0,
            animation: refreshing ? 'mesa-spin .8s linear infinite' : undefined,
          }}
        />
      </div>
      <div ref={contentRef}>{children}</div>
    </div>
  )
}
