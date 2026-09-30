import { useHeaderHeight } from 'expo-router/build/react-navigation/elements'
import { useRef } from 'react'

// The scroll offset of a list's REAL top when it sits under a native large-title
// bar with contentInsetAdjustmentBehavior="automatic". That top is not 0: UIKit
// parks the content a header's-worth of points down, so it rests at minus the
// header's height, and `scrollToOffset({ offset: 0 })` lands a header lower —
// the search field and filters scrolled off, which read as a tab re-press
// "scrolling down instead of up". The list must also set `scrollToOverflowEnabled`:
// without it React Native clamps scrollTo against its own contentInset (0 here)
// and turns this negative offset back into 0.
//
// The tallest height seen is kept, because the bar reports a shorter one once its
// large title collapses and the top is the expanded one. Only for a screen inside
// a Stack that draws a header: the hook throws where there is none.
//
// expo-router doesn't re-export useHeaderHeight from its public entry point; it is
// the copy its own native-stack view provides (same reason as lib/preventRemove.ts).
export function useScrollTopOffset(): number {
  const height = useHeaderHeight()
  const tallest = useRef(0)
  tallest.current = Math.max(tallest.current, height)
  return -tallest.current
}
