// The top of the Feed — your six, tonight, new near you — is worked out from what friends
// ranked lately, so it holds all day rather than moving minute to minute. It is cached
// until 5 AM Santo Domingo, when the night is over and tomorrow's list starts. Santo
// Domingo is UTC-4 with no daylight saving (lib/eventTime.ts), so 5 AM there is a fixed
// 09:00 UTC. Pure, so it is unit-tested.

const REFRESH_UTC_HOUR = 9
const DAY_MS = 24 * 60 * 60 * 1000

// Milliseconds from `now` to the next 5 AM in Santo Domingo — the query's staleTime.
export function msUntilHomeRefresh(now: Date = new Date()): number {
  const d = new Date(now)
  let next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), REFRESH_UTC_HOUR)
  if (next <= now.getTime()) next += DAY_MS
  return next - now.getTime()
}
