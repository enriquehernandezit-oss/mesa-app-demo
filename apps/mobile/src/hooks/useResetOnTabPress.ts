import { useNavigation } from 'expo-router'
import { useEffect } from 'react'

// Fires `onPress` whenever THIS screen's own bottom-tab icon is pressed —
// switching to it from a different tab, or re-pressing the one already
// active (MesaTabBar's onPress emits `tabPress` unconditionally either way,
// see its header comment). Deliberately NOT React Navigation's focus/blur:
// that also fires when a screen nested inside this tab's own stack is
// pushed/popped (Explore's place-map, say), and returning from a detail
// screen should land exactly where the member left it, not reset to the top
// — only an actual tab-bar press should do that (M23).
//
// A screen registered directly under (tabs)/ listens on its own navigation
// object. A screen nested one level deeper, inside that tab's own Stack
// (Explore), has to reach the tab navigator itself — pass `{ nested: true }`
// there, or the tabPress event never arrives (it's emitted for the outer
// tab route's key, not the inner stack screen's).
//
// `tabPress` is a real event MesaTabBar.tsx already emits (`navigation.emit
// ({ type: 'tabPress', ... })`) — useNavigation()'s generic return type just
// doesn't know about it (that event map only exists once the navigator is
// known to be a bottom-tab one, which a plain screen can't prove statically).
// This models exactly the one method actually used rather than widening to
// `any`.
interface TabPressListener {
  addListener(event: 'tabPress', callback: () => void): () => void
}

export function useResetOnTabPress(onPress: () => void, opts?: { nested?: boolean }): void {
  const navigation = useNavigation()
  const target = (opts?.nested ? navigation.getParent() : navigation) as
    | TabPressListener
    | undefined
  useEffect(() => {
    if (!target) return
    return target.addListener('tabPress', onPress)
  }, [target, onPress])
}
