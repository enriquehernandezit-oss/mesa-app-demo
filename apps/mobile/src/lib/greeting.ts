// Which part of the day it is, for the Feed's greeting. Local time on the phone —
// Mesa is used in Santo Domingo, so the device clock is the right one.
export type DayPart = 'morning' | 'afternoon' | 'evening'

export function dayPart(date: Date = new Date()): DayPart {
  const h = date.getHours()
  if (h >= 5 && h < 12) return 'morning'
  if (h >= 12 && h < 18) return 'afternoon'
  return 'evening'
}
