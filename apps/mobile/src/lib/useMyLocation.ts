// A module-level location store — no provider, no context. Same shape as
// components/ui/toast-store.ts: any component calls requestMyLocation(), every
// useMyLocation() subscriber re-renders. Ported from apps/app/src/lib/
// useMyLocation.ts; the web sessionStorage cache is dropped (RN has none, and the
// module already persists across navigation within a session), and the passive
// "already denied?" check uses expo-location instead of navigator.permissions.
import * as Location from 'expo-location'
import { useSyncExternalStore } from 'react'
import { type LatLng, getPosition } from './geo'

type Status = 'idle' | 'loading' | 'granted' | 'denied'
type Snapshot = { position: LatLng | null; status: Status }

let snapshot: Snapshot = { position: null, status: 'idle' }
let inFlight: Promise<LatLng | null> | null = null
const listeners = new Set<() => void>()

function setSnapshot(next: Partial<Snapshot>) {
  snapshot = { ...snapshot, ...next }
  for (const l of listeners) l()
}

// A passive read of an earlier decision — never prompts. Lets a member who
// already denied location not get treated as brand-new (the "Cerca" chip then
// resolves to null immediately instead of re-prompting).
Location.getForegroundPermissionsAsync()
  .then((p) => {
    if (
      snapshot.status === 'idle' &&
      p.status === Location.PermissionStatus.DENIED &&
      !p.canAskAgain
    )
      setSnapshot({ status: 'denied' })
  })
  .catch(() => {
    // Not available — stay 'idle'.
  })

// Requests the device's real position. Only ever from a tap. A denial or timeout
// resolves to null; every caller treats that as "just don't sort by distance".
export function requestMyLocation(): Promise<LatLng | null> {
  if (snapshot.position) return Promise.resolve(snapshot.position)
  if (snapshot.status === 'denied') return Promise.resolve(null)
  if (inFlight) return inFlight
  setSnapshot({ status: 'loading' })
  inFlight = getPosition()
    .then((pos) => {
      setSnapshot({ position: pos, status: 'granted' })
      return pos
    })
    .catch(() => {
      setSnapshot({ status: 'denied' })
      return null
    })
    .finally(() => {
      inFlight = null
    })
  return inFlight
}

export function useMyLocation() {
  const s = useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange)
      return () => listeners.delete(onChange)
    },
    () => snapshot,
  )
  return { position: s.position, status: s.status, request: requestMyLocation }
}
