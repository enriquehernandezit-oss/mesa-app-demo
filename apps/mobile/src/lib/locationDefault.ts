import * as SecureStore from 'expo-secure-store'

import { type LocationItem, applyDefaultLocation, parseStoredDefault } from './locationFilter'

// The default city, remembered on this phone (SecureStore — there is no localStorage on native), like the
// language. The store itself and its rules are lib/locationFilter.ts.
const KEY = 'mesa.default_city'

// Read once at start-up (awaited with the language in the root layout, so the first search already uses it).
export async function initLocationDefault(): Promise<void> {
  try {
    const read = SecureStore.getItemAsync(KEY)
    const timeout = new Promise<null>((r) => setTimeout(() => r(null), 3000))
    const item = parseStoredDefault(await Promise.race([read, timeout]))
    if (item) applyDefaultLocation(item)
  } catch {
    // keep Santo Domingo
  }
}

// Settings: the city every search starts from. It is also what is being searched right now.
export function setDefaultLocation(item: LocationItem): void {
  applyDefaultLocation(item)
  void SecureStore.setItemAsync(KEY, JSON.stringify(item)).catch(() => {})
}
