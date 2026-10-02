import { useSyncExternalStore } from 'react'

// The city filter: WHERE Mesa is searching, for both Mesa's own places and Google's. It is a short list of
// cities, each a chip you can remove — your default city to start (Santo Domingo until you change it in
// Settings), then whatever you add. Search for a city, tap it, add as many as you like (up to MAX_LOCATIONS).
//
// "Santo Domingo" is a built-in item, not a Google city: it means Mesa's listed Santo Domingo sectors
// (the area the whole catalog is filed under), which no single Google city boundary matches. Every other
// city is a Google place the member searched for.
//
// The state is one module-level value shared by every screen that searches (Explore, the rank flow's find
// step): where you are looking does not change because you changed screens. Explore resets it to the
// default when its tab is pressed again. The DEFAULT is remembered on the phone (SecureStore), like the
// language.

export interface City {
  placeId: string
  name: string
  // "Florida, EE. UU." — what tells two Madrids apart.
  subtitle: string
}

export type LocationItem = { kind: 'sd' } | ({ kind: 'city' } & City)

export type LocationFilter = LocationItem[]

// What a member starts with, before they choose a default of their own.
export const DEFAULT_LOCATION: LocationFilter = [{ kind: 'sd' }]

// More than this is a country, not a place to look — and each city is a Google request per search.
export const MAX_LOCATIONS = 5

export const itemKey = (i: LocationItem): string =>
  i.kind === 'city' ? `city:${i.placeId}` : i.kind

export const sameLocation = (a: LocationFilter, b: LocationFilter): boolean =>
  a.length === b.length && a.every((x, i) => b[i] !== undefined && itemKey(x) === itemKey(b[i]))

// Add a place, up to MAX_LOCATIONS; one already there changes nothing.
export function addItem(f: LocationFilter, item: LocationItem): LocationFilter {
  if (f.some((x) => itemKey(x) === itemKey(item))) return f
  return f.length >= MAX_LOCATIONS ? f : [...f, item]
}

// Remove one. An empty filter is not "nowhere" — it is the default.
export function removeItem(
  f: LocationFilter,
  key: string,
  def: LocationFilter = DEFAULT_LOCATION,
): LocationFilter {
  const next = f.filter((x) => itemKey(x) !== key)
  return next.length === 0 ? def : next
}

export type Where = 'sd' | 'none'

// What the API takes: 'sd' when Santo Domingo is in the list ('none' otherwise — only cities), and the
// cities' Google ids. (The API still understands wider areas; the app no longer offers them.)
export function locationParams(f: LocationFilter): { where: Where; cities: string[] } {
  return {
    where: f.some((i) => i.kind === 'sd') ? 'sd' : 'none',
    cities: f.flatMap((i) => (i.kind === 'city' ? [i.placeId] : [])),
  }
}

// `where=sd&cities=a,b` — appended to a search URL, and a cache key for the search it scopes.
export function locationQuery(f: LocationFilter): string {
  const { where, cities } = locationParams(f)
  return cities.length > 0 ? `where=${where}&cities=${cities.join(',')}` : `where=${where}`
}

export interface LocationWords {
  // Santo Domingo, said in full when it is the only place: "Santo Domingo, RD".
  home: string
  sd: string
}

// The one-line summary on the collapsed field.
export function locationLabel(f: LocationFilter, words: LocationWords): string {
  const [only] = f
  if (f.length === 1 && only?.kind === 'sd') return words.home
  return f.map((i) => (i.kind === 'city' ? i.name : words.sd)).join(' · ')
}

// ── the shared values ────────────────────────────────────────────────────────────────────────────

let defaultFilter: LocationFilter = DEFAULT_LOCATION
let current: LocationFilter = DEFAULT_LOCATION
const listeners = new Set<() => void>()
const emit = () => {
  for (const l of listeners) l()
}
const set = (next: LocationFilter) => {
  if (next === current) return
  current = next
  emit()
}
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

export const getLocation = (): LocationFilter => current
export const getDefaultLocation = (): LocationFilter => defaultFilter
export const isDefaultLocation = (f: LocationFilter): boolean => sameLocation(f, defaultFilter)
export const addLocation = (item: LocationItem) => set(addItem(current, item))
export const removeLocation = (key: string) => set(removeItem(current, key, defaultFilter))
export const resetLocation = () => set(defaultFilter)

export function useLocationFilter(): LocationFilter {
  return useSyncExternalStore(subscribe, getLocation, getLocation)
}

// The member's default city, for Settings.
export function useDefaultLocation(): LocationFilter {
  return useSyncExternalStore(subscribe, getDefaultLocation, getDefaultLocation)
}

// Makes this the default city — and what is being searched right now. (Storing it is locationDefault.ts.)
export function applyDefaultLocation(item: LocationItem): void {
  defaultFilter = [item]
  current = defaultFilter
  emit()
}

// What was stored, or null when it is missing or not a valid item (a stale or hand-edited value never
// breaks the filter: it just falls back to Santo Domingo).
export function parseStoredDefault(raw: string | null): LocationItem | null {
  if (!raw) return null
  try {
    const v: unknown = JSON.parse(raw)
    if (typeof v !== 'object' || v === null) return null
    const o = v as Record<string, unknown>
    if (o.kind === 'sd') return { kind: 'sd' }
    if (
      o.kind === 'city' &&
      typeof o.placeId === 'string' &&
      o.placeId.length > 0 &&
      typeof o.name === 'string' &&
      typeof o.subtitle === 'string'
    ) {
      return { kind: 'city', placeId: o.placeId, name: o.name, subtitle: o.subtitle }
    }
  } catch {
    // fall through
  }
  return null
}
