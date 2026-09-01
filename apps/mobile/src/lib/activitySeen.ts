import * as SecureStore from 'expo-secure-store'
import { useSyncExternalStore } from 'react'

// The Activity bell's unseen badge compares activity timestamps against a local
// "seen" watermark that the Activity screen advances when opened. Ported from the
// localStorage helpers in apps/app/src/components/TopBar.tsx; native has no
// localStorage, so the watermark lives in SecureStore behind a useSyncExternalStore
// module store (same pattern as toast-store) — the TopBar badge subscribes and
// recomputes the instant "Marcar leído" fires.
const KEY = 'mesa.activity_seen'
const EPOCH = new Date(0).toISOString()

let watermark = EPOCH
let loaded = false
const listeners = new Set<() => void>()
function emit() {
  for (const l of listeners) l()
}

// Fire-and-forget seed from the Keychain — until it resolves the watermark reads
// as epoch (everything unseen), then corrects on load.
async function load(): Promise<void> {
  if (loaded) return
  loaded = true
  try {
    const v = await SecureStore.getItemAsync(KEY)
    if (v) {
      watermark = v
      emit()
    }
  } catch {
    // keep epoch
  }
}
void load()

export function markActivitySeen(): void {
  watermark = new Date().toISOString()
  emit()
  void SecureStore.setItemAsync(KEY, watermark).catch(() => {})
}

export function useActivitySeen(): string {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => watermark,
  )
}
