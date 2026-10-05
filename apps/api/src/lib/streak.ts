import { sdLocalNow } from './sdTime'

// The weekly ranking streak: how many consecutive weeks, ending now, hold at least one ranking.
//
// Weeks are Monday–Sunday in Santo Domingo. (It used to count floor(epoch / 7 days) in UTC, whose
// weeks start on a Thursday at 8 PM Santo Domingo time — so a member's week turned over in the
// middle of a Thursday evening, and a Sunday-night ranking could land in the wrong week.)
//
// The streak is alive until the current week ends: a member who ranked every week through last
// week but has not ranked yet this Monday still has their streak, it simply has not grown. It
// reads 0 only once a whole week has passed with nothing.
const DAY_MS = 24 * 60 * 60 * 1000

// The Monday-aligned week number of an instant, in Santo Domingo. Day 0 of the epoch was a
// Thursday, so shifting by 3 days makes weeks start on Monday.
export function sdWeek(at: Date): number {
  const days = Math.floor(sdLocalNow(at).getTime() / DAY_MS)
  return Math.floor((days + 3) / 7)
}

export function weeklyStreak(rankedAt: Date[], now: Date = new Date()): number {
  const weeks = new Set(rankedAt.map(sdWeek))
  const thisWeek = sdWeek(now)
  let w = weeks.has(thisWeek) ? thisWeek : thisWeek - 1
  let streak = 0
  for (; weeks.has(w); w--) streak++
  return streak
}
