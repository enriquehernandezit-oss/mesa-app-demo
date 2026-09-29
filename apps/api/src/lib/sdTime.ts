// Santo Domingo wall-clock helpers. SD has no DST (fixed UTC-4), so a fixed offset
// is exact — no timezone library. Shared by the events routes and GET /home; the
// push sweeps keep their own hour-of-day check (lib/push.ts), a different question.
export const SD_UTC_OFFSET_HOURS = 4

// A Date whose UTC getters read as Santo Domingo wall-clock fields — NOT a real
// instant, just a convenient way to read local Y/M/D/hour/day-of-week.
export function sdLocalNow(now: Date = new Date()): Date {
  return new Date(now.getTime() - SD_UTC_OFFSET_HOURS * 3600_000)
}

// The real UTC instant of SD-local midnight, `addDays` after `sdLocal`'s own date.
// `sdLocal`'s UTC Y/M/D fields (from sdLocalNow) ARE Santo Domingo's wall-clock
// Y/M/D, so Date.UTC(...) on them gives "midnight as if SD were UTC" — adding the
// offset back converts that to the real instant.
export function sdMidnight(sdLocal: Date, addDays: number): Date {
  const ms = Date.UTC(
    sdLocal.getUTCFullYear(),
    sdLocal.getUTCMonth(),
    sdLocal.getUTCDate() + addDays,
  )
  return new Date(ms + SD_UTC_OFFSET_HOURS * 3600_000)
}

// The hour of day (0–23) in Santo Domingo.
export function sdHour(now: Date = new Date()): number {
  return sdLocalNow(now).getUTCHours()
}

// "Tonight" as the feed means it: from the start of this SD night to 4 AM the next
// morning, as [start, end) over startsAt. A night doesn't end at midnight — a 1 AM
// set is still tonight — so before 4 AM we are still in the PREVIOUS calendar day's
// night. (eventsWindow('tonight') in routes/events.ts stops at midnight; that is the
// Explore browse window and is left alone.)
export const TONIGHT_ENDS_AT_HOUR = 4
export function tonightLateWindow(now: Date = new Date()): { start: Date; end: Date } {
  const anchor = sdLocalNow(new Date(now.getTime() - TONIGHT_ENDS_AT_HOUR * 3600_000))
  return {
    start: sdMidnight(anchor, 0),
    end: new Date(sdMidnight(anchor, 1).getTime() + TONIGHT_ENDS_AT_HOUR * 3600_000),
  }
}
