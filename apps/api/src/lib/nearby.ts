import { schema } from '@mesa/db'
import { sql } from 'drizzle-orm'

// Explore's "Cerca": the member's position (sent only while the chip is on, rounded on the phone to
// about 100 m), how far each place is from it, and the radius that counts as near. Never stored or
// logged — it lives for one request.
const { restaurants } = schema

export type Near = { lat: number; lng: number }

export const DEFAULT_RADIUS_M = 3000
const MIN_RADIUS_M = 500
const MAX_RADIUS_M = 20_000

// "18.472,-69.931" → a position, or null when absent or not a real coordinate.
export function parseNear(raw: string | undefined): Near | null {
  if (!raw) return null
  const [a, b, extra] = raw.split(',')
  if (extra !== undefined) return null
  const lat = Number(a)
  const lng = Number(b)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  return { lat, lng }
}

export function parseRadius(raw: string | undefined): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_RADIUS_M
  return Math.min(MAX_RADIUS_M, Math.max(MIN_RADIUS_M, Math.round(n)))
}

// Great-circle metres from `near` to the place's pin, in SQL (the same haversine the app and
// packages/db use; no PostGIS for a catalog this size).
export const distanceSql = (near: Near) =>
  sql<number>`(6371000 * 2 * asin(sqrt(
    power(sin(radians(${restaurants.lat} - ${near.lat}) / 2), 2) +
    cos(radians(${near.lat})) * cos(radians(${restaurants.lat})) *
    power(sin(radians(${restaurants.lng} - ${near.lng}) / 2), 2)
  )))`
