// A module-level location store — no provider, no context. Same shape as
// components/ui/toast-store.ts: any component can call requestMyLocation(),
// every useMyLocation() subscriber re-renders. This has to be shared rather
// than per-component state — tapping "Cerca" on Discover and reading the
// result on the /map screen after navigating are two different component
// instances, and a plain useState seeded from cache at mount would miss a
// position that resolves after the map has already mounted.
import { useSyncExternalStore } from 'react'
import { type LatLng, getPosition } from './geo'

type Status = 'idle' | 'loading' | 'granted' | 'denied'
type Snapshot = { position: LatLng | null; status: Status }

const CACHE_KEY = 'mesa.myLocation'

function readCache(): LatLng | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    return raw ? (JSON.parse(raw) as LatLng) : null
  } catch {
    return null
  }
}

function writeCache(pos: LatLng | null) {
  try {
    if (pos) sessionStorage.setItem(CACHE_KEY, JSON.stringify(pos))
    else sessionStorage.removeItem(CACHE_KEY)
  } catch {
    // Storage unavailable (private mode, quota) — position just won't persist
    // across a reload; the in-memory value still works for this session.
  }
}

const cachedPosition = readCache()
let snapshot: Snapshot = { position: cachedPosition, status: cachedPosition ? 'granted' : 'idle' }
let inFlight: Promise<LatLng | null> | null = null
const listeners = new Set<() => void>()

function setSnapshot(next: Partial<Snapshot>) {
  snapshot = { ...snapshot, ...next }
  for (const l of listeners) l()
}

// A passive read of a decision from an earlier session — never prompts.
// Lets a member who already denied location not get treated as brand-new.
if (typeof navigator !== 'undefined' && navigator.permissions?.query) {
  navigator.permissions
    .query({ name: 'geolocation' })
    .then((p) => {
      if (snapshot.status === 'idle' && p.state === 'denied') setSnapshot({ status: 'denied' })
    })
    .catch(() => {
      // Some browsers don't support querying 'geolocation' — stay 'idle'.
    })
}

// Requests the device's real position. Never called automatically — only
// from a tap (the "Cerca" pill, the rank flow's nearby chip). A denial or
// timeout resolves to null; every caller treats that as "just don't sort by
// distance" rather than surfacing an error — this feature only ever adds to
// what already worked without it.
export function requestMyLocation(): Promise<LatLng | null> {
  if (snapshot.position) return Promise.resolve(snapshot.position)
  // Once denied (this session, or an earlier one via the passive permissions
  // check above), don't nag — a caller can still call this again, but it
  // won't re-trigger the OS prompt itself.
  if (snapshot.status === 'denied') return Promise.resolve(null)
  if (inFlight) return inFlight
  setSnapshot({ status: 'loading' })
  inFlight = getPosition()
    .then((pos) => {
      writeCache(pos)
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
