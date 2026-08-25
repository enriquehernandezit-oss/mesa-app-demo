// A module-level "which nav app" chooser store — same shape as
// components/ui/toast-store.ts. Any "Cómo llegar" pill calls
// openNavChooser({lat,lng,label}); one <NavChooserSheet/> (mounted once, in
// main.tsx) renders whichever request is currently live, so all four
// directions sites (map, restaurant, dish, tonight) share one sheet instead
// of each screen owning its own.
import { Preferences } from '@capacitor/preferences'
import { useSyncExternalStore } from 'react'

// 'coords' is the normal case (every real Mesa restaurant has lat/lng).
// 'query' exists only for the Tonight flow's fixture data, which has no
// coordinates at all — Waze can't take a text query (it "does not have
// access to accurate, high fidelity place data" per its own docs, coordinates
// only), so the sheet omits Waze for a 'query' request; Google/Apple both
// accept free text.
export type NavRequest =
  | { kind: 'coords'; lat: number; lng: number; label: string }
  | { kind: 'query'; query: string; label: string }
export type NavApp = 'waze' | 'google' | 'apple'

const LAST_APP_KEY = 'mesa.lastNavApp'

let request: NavRequest | null = null
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

export function openNavChooser(next: NavRequest) {
  request = next
  emit()
}

export function closeNavChooser() {
  request = null
  emit()
}

export function useNavRequest(): NavRequest | null {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange)
      return () => listeners.delete(onChange)
    },
    () => request,
  )
}

function urlFor(app: NavApp, r: NavRequest): string {
  const dest = r.kind === 'coords' ? `${r.lat},${r.lng}` : encodeURIComponent(r.query)
  if (app === 'waze') {
    // Never actually called for a 'query' request — the sheet doesn't offer
    // Waze in that case (see NavChooserSheet.tsx) — but return something
    // sane rather than a malformed URL if it ever is.
    return r.kind === 'coords'
      ? `https://waze.com/ul?ll=${r.lat},${r.lng}&navigate=yes`
      : `https://waze.com/ul?q=${dest}&navigate=yes`
  }
  if (app === 'apple') return `https://maps.apple.com/?daddr=${dest}`
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}`
}

export function chooseNavApp(app: NavApp, r: NavRequest) {
  window.open(urlFor(app, r), '_blank', 'noopener,noreferrer')
  closeNavChooser()
  Preferences.set({ key: LAST_APP_KEY, value: app }).catch(() => {
    // Best-effort — the app still opened; just won't be remembered next time.
  })
}

// Read once by the sheet on open, to sort the last-used app first. Doesn't
// skip the sheet entirely — every tap still gets a real choice, "remember"
// just means not making someone re-find their usual app every time.
export async function getLastNavApp(): Promise<NavApp | null> {
  try {
    const { value } = await Preferences.get({ key: LAST_APP_KEY })
    return value === 'waze' || value === 'google' || value === 'apple' ? value : null
  } catch {
    return null
  }
}
