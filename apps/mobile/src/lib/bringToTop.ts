import type { RefObject } from 'react'
import { Keyboard } from 'react-native'
import type { FlatList, FocusEvent, HostInstance, ScrollView } from 'react-native'

// Tapping a search bar slides the page up until the bar sits at the top of the screen, so what it
// finds fills the space above the keyboard instead of hiding under it (Instagram, Apple Maps). The
// keyboard goes away on a drag or "Buscar"; the page stays where it is, results in view.
//
// Works from the focus event, so a search field nested in a picker needs no ref of its own: the
// event's target is measured against the page's scroll view. measureLayout reports the field's
// position in the scroll CONTENT (Fabric leaves the scroll offset out of it), which is exactly the
// offset to scroll to. The host scroll view sets `scrollToOverflowEnabled`, so a field near the end of
// a short page can still reach the top, and `automaticallyAdjustKeyboardInsets`, so a drag can too.

export type ScrollHost = {
  node: () => HostInstance | null
  scrollToY: (y: number) => void
}

export const scrollViewHost = (ref: RefObject<ScrollView | null>): ScrollHost => ({
  node: () => ref.current?.getNativeScrollRef() ?? null,
  scrollToY: (y) => ref.current?.scrollTo({ y, animated: true }),
})

// A FlatList's getNativeScrollRef() answers with its ScrollView component, not the native element under
// it, and measureLayout silently does nothing unless it is handed the native element.
type ScrollRefHolder = { getNativeScrollRef: () => HostInstance | null }
const hasScrollRef = (x: unknown): x is ScrollRefHolder =>
  typeof x === 'object' &&
  x !== null &&
  typeof (x as { getNativeScrollRef?: unknown }).getNativeScrollRef === 'function'

export const flatListHost = <T>(ref: RefObject<FlatList<T> | null>): ScrollHost => ({
  node: () => {
    const inner: unknown = ref.current?.getNativeScrollRef()
    return hasScrollRef(inner)
      ? inner.getNativeScrollRef()
      : ((inner as HostInstance | null) ?? null)
  },
  scrollToY: (offset) => ref.current?.scrollToOffset({ offset, animated: true }),
})

// `top` is the bottom edge, in screen points, of whatever covers the top of the screen (a navigation bar
// the content scrolls under); 0 when nothing does. `gap` is the room left above the field.
export function bringToTop(
  host: ScrollHost,
  e: FocusEvent,
  { top = 0, gap = 12 }: { top?: number; gap?: number } = {},
) {
  const field = e.currentTarget
  const scroll = host.node()
  if (!field || !scroll) return
  const run = () =>
    // Where the scroll view itself sits on screen: the field lands just under whichever is lower, the
    // scroll view's top edge or the bar over it.
    scroll.measureInWindow((_sx, frameTop) => {
      field.measureLayout(scroll, (_x, y) => {
        const visibleTop = Math.max(frameTop, top)
        host.scrollToY(Math.max(frameTop + y - visibleTop - gap, frameTop - visibleTop))
      })
    })
  // Not on focus itself: when the keyboard starts to rise, React Native's own keyboard handling
  // (automaticallyAdjustKeyboardInsets) sets the scroll offset again and cancelled a scroll made any
  // earlier. So this waits for the keyboard to start showing — the slide then runs alongside it — and
  // goes at once when the keyboard is already up (moving from one field to another).
  if (Keyboard.isVisible()) {
    requestAnimationFrame(run)
    return
  }
  let done = false
  const go = () => {
    if (done) return
    done = true
    sub.remove()
    clearTimeout(fallback)
    requestAnimationFrame(run)
  }
  const sub = Keyboard.addListener('keyboardWillShow', go)
  const fallback = setTimeout(go, 600)
}
