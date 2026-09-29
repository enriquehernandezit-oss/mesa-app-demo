// "12 AM", "9 PM": a restaurant's closing time as it is shown. `closesAt` is a display
// label in the database ("1a", "12a", "11p" — restaurants.closesAt), not a parsed time; this
// reads it and returns null for anything that isn't one (imported rows have none).
export function closesLabel(closesAt: string | null | undefined): string | null {
  const m = /^(\d{1,2})([ap])$/i.exec((closesAt ?? '').trim())
  if (!m) return null
  const hour = Number(m[1])
  if (hour < 1 || hour > 12) return null
  return `${hour} ${m[2]!.toLowerCase() === 'a' ? 'AM' : 'PM'}`
}
