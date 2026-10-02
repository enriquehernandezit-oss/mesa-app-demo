import { useEffect, useState } from 'react'
import { Dimensions, Keyboard, LayoutAnimation, Platform } from 'react-native'

// How much of the BOTTOM of the screen the keyboard is covering right now (0 with no keyboard, or with a
// hardware one). For a view whose bottom edge IS the bottom of the screen — a page sheet's composer — pad
// it by this much and the keyboard sits under it, not over it.
//
// Why not KeyboardAvoidingView: it measures where its view sits relative to its parent, not to the
// screen, so inside a page sheet (which starts a few dozen points below the top of the screen) it lifts the
// content too little and the keyboard covers the line being typed. The keyboard's own screen position
// doesn't depend on where the sheet starts.
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0)
  useEffect(() => {
    if (Platform.OS !== 'ios') return
    const change = Keyboard.addListener('keyboardWillChangeFrame', (e) => {
      const covered = Math.max(0, Dimensions.get('window').height - e.endCoordinates.screenY)
      // Ease with the keyboard rather than jumping
      LayoutAnimation.configureNext(
        LayoutAnimation.create(e.duration || 250, LayoutAnimation.Types.keyboard),
      )
      setInset(covered)
    })
    const hide = Keyboard.addListener('keyboardWillHide', (e) => {
      LayoutAnimation.configureNext(
        LayoutAnimation.create(e.duration || 250, LayoutAnimation.Types.keyboard),
      )
      setInset(0)
    })
    return () => {
      change.remove()
      hide.remove()
    }
  }, [])
  return inset
}
