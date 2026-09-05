import * as SecureStore from 'expo-secure-store'
import { useSyncExternalStore } from 'react'

// Client-only preference (mock H1 "Tu lista"). `friendsOnly` hides the
// all-of-Mesa aggregate score so you only see your circle — purely a display
// filter, which is why it's honest to keep client-side. Ported from
// apps/app/src/lib/prefs.ts (localStorage) to SecureStore + a useSyncExternalStore
// module store, so a screen reading it re-renders the moment Settings flips it.
//
// Stealth mode is deliberately NOT here, and no longer in Settings either:
// hiding your activity from others is a SERVER concern that a local flag can
// never deliver, and it was removed rather than left as a dated promise. If it
// returns it arrives enforced server-side, in lib/visibility.ts.
const KEY = 'mesa.friends_only_scores'

let friendsOnly = false
const listeners = new Set<() => void>()
function emit() {
  for (const l of listeners) l()
}

SecureStore.getItemAsync(KEY)
  .then((v) => {
    if (v === '1') {
      friendsOnly = true
      emit()
    }
  })
  .catch(() => {
    // No stored value — stay false (show the Mesa aggregate).
  })

export function setFriendsOnlyScores(on: boolean): void {
  friendsOnly = on
  emit()
  void SecureStore.setItemAsync(KEY, on ? '1' : '0').catch(() => {})
}

export function useFriendsOnlyScores(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => friendsOnly,
  )
}
