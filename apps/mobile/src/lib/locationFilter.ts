import { useSyncExternalStore } from 'react'

// The location filter: WHERE Mesa is searching, for both Mesa's own places and Google's. It is a
// short list of places, each one a chip you can remove — Santo Domingo by default, then whatever you
// add: the whole Dominican Republic, the world, or any cities. (Beli's location field, with several.)
//
// A list rather than a single value because the three presets are not equals: the Dominican
// Republic contains Santo Domingo and the world contains everything, so adding the bigger one drops
// the smaller. Cities are always additive, up to MAX_CITIES.
//
// The state is one module-level value shared by every screen that searches (Explore, the rank
// flow's find step): where you are looking does not change because you changed screens. Explore
// resets it to the default when its tab is pressed again.

export interface City {
  placeId: string
  name: string
  // "Florida, EE. UU." — what tells two Madrids apart.
  subtitle: string
}

export type LocationItem =
  | { kind: 'sd' }
  | { kind: 'do' }
  | { kind: 'world' }
  | ({ kind: 'city' } & City)

export type LocationFilter = LocationItem[]

export const DEFAULT_LOCATION: LocationFilter = [{ kind: 'sd' }]

// More than this is a country, not a place to look — and each city is a Google request per search.
export const MAX_CITIES = 5

export const itemKey = (i: LocationItem): string =>
  i.kind === 'city' ? `city:${i.placeId}` : i.kind

export function isDefaultLocation(f: LocationFilter): boolean {
  return f.length === 1 && f[0]?.kind === 'sd'
}

export const cityCount = (f: LocationFilter): number => f.filter((i) => i.kind === 'city').length

// Add a place. The bigger preset swallows the smaller: "everywhere" replaces the list, the Dominican
// Republic replaces Santo Domingo, and Santo Domingo is not added inside either. A city narrows
// "everywhere" (you are now looking somewhere in particular), so it replaces that.
export function addItem(f: LocationFilter, item: LocationItem): LocationFilter {
  if (f.some((x) => itemKey(x) === itemKey(item))) return f
  if (item.kind === 'world') return [item]
  const narrowed = f.filter((x) => x.kind !== 'world')
  if (item.kind === 'do') return [item, ...narrowed.filter((x) => x.kind !== 'sd')]
  if (item.kind === 'sd')
    return narrowed.some((x) => x.kind === 'do') ? narrowed : [item, ...narrowed]
  return cityCount(narrowed) >= MAX_CITIES ? narrowed : [...narrowed, item]
}

// Remove one. An empty filter is not "nowhere" — it is the default.
export function removeItem(f: LocationFilter, key: string): LocationFilter {
  const next = f.filter((x) => itemKey(x) !== key)
  return next.length === 0 ? DEFAULT_LOCATION : next
}

export type Where = 'sd' | 'do' | 'world' | 'none'

// What the API takes: the widest preset in the list ('none' when there is none — only cities), and
// the cities' Google ids.
export function locationParams(f: LocationFilter): { where: Where; cities: string[] } {
  const has = (k: LocationItem['kind']) => f.some((i) => i.kind === k)
  const where: Where = has('world') ? 'world' : has('do') ? 'do' : has('sd') ? 'sd' : 'none'
  return { where, cities: f.flatMap((i) => (i.kind === 'city' ? [i.placeId] : [])) }
}

// `where=sd&cities=a,b` — appended to a search URL, and a cache key for the search it scopes.
export function locationQuery(f: LocationFilter): string {
  const { where, cities } = locationParams(f)
  return cities.length > 0 ? `where=${where}&cities=${cities.join(',')}` : `where=${where}`
}

export interface LocationWords {
  // The default, said in full: "Santo Domingo, RD".
  home: string
  sd: string
  do: string
  world: string
}

// The one-line summary on the collapsed field.
export function locationLabel(f: LocationFilter, words: LocationWords): string {
  if (isDefaultLocation(f)) return words.home
  return f.map((i) => (i.kind === 'city' ? i.name : words[i.kind])).join(' · ')
}

// ── the shared value ─────────────────────────────────────────────────────────────────────────────

let current: LocationFilter = DEFAULT_LOCATION
const listeners = new Set<() => void>()
const set = (next: LocationFilter) => {
  if (next === current) return
  current = next
  for (const l of listeners) l()
}
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

export const getLocation = (): LocationFilter => current
export const addLocation = (item: LocationItem) => set(addItem(current, item))
export const removeLocation = (key: string) => set(removeItem(current, key))
export const resetLocation = () => set(DEFAULT_LOCATION)

export function useLocationFilter(): LocationFilter {
  return useSyncExternalStore(subscribe, getLocation, getLocation)
}
