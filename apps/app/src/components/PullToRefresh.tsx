import { type PropsWithChildren, useRef, useState } from 'react'

// Touch pull-to-refresh for the feed (and any scrolling tab). Pure touch events
// — no library. When the page is scrolled to the top and the user drags down
// past the threshold, onRefresh runs and a brass spinner shows until it settles.
const THRESHOLD = 72

export function PullToRefresh({
  onRefresh,
  children,
}: PropsWithChildren<{ onRefresh: () => Promise<unknown> }>) {
  const startY = useRef<number | null>(null)
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  function onTouchStart(e: React.TouchEvent) {
    if (window.scrollY <= 0 && !refreshing) {
      startY.current = e.touches[0]?.clientY ?? null
    }
  }
  function onTouchMove(e: React.TouchEvent) {
    if (startY.current === null || refreshing) return
    const dy = (e.touches[0]?.clientY ?? 0) - startY.current
    // Rubber-band: display half the drag distance, capped.
    setPull(dy > 0 ? Math.min(dy / 2, THRESHOLD * 1.4) : 0)
  }
  async function onTouchEnd() {
    const releasedAt = pull
    startY.current = null
    if (releasedAt >= THRESHOLD) {
      setRefreshing(true)
      setPull(THRESHOLD * 0.75)
      try {
        await onRefresh()
      } finally {
        setRefreshing(false)
        setPull(0)
      }
    } else {
      setPull(0)
    }
  }

  // Zero-layout reveal: the spinner is absolutely positioned in the strip the
  // content vacates, and the content itself translates down by `pull` to expose
  // it. Nothing consumes layout height at rest (pull === 0 → no gap, no reflow),
  // and only transform/opacity animate. Dragging tracks the finger 1:1 (no
  // transition); releasing settles both back with --ease-out.
  const maxHeight = THRESHOLD * 1.4
  const dragging = startY.current !== null
  const settle = dragging ? undefined : 'transform var(--dur-base) var(--ease-out)'
  return (
    <div
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      style={{ position: 'relative' }}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: maxHeight,
          display: 'grid',
          placeItems: 'center',
          transform: `translateY(${pull - maxHeight}px)`,
          transition: settle,
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            width: 22,
            height: 22,
            borderRadius: '50%',
            border: '2px solid var(--line)',
            borderTopColor: 'var(--accent)',
            opacity: Math.min(pull / THRESHOLD, 1),
            transform: `rotate(${pull * 3}deg)`,
            transition: dragging ? undefined : 'opacity var(--dur-base) var(--ease-out)',
            animation: refreshing ? 'mesa-spin .8s linear infinite' : undefined,
          }}
        />
      </div>
      <div style={{ transform: pull ? `translateY(${pull}px)` : undefined, transition: settle }}>
        {children}
      </div>
    </div>
  )
}
