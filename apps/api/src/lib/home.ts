// The pure part of GET /home — what goes in the Feed's "Your six" and its "Tonight"
// card. Every rule lives here, with no database, so it is unit-tested to the letter
// (lib/home.test.ts); routes/home.ts only fetches the candidates and hands them in.

// ── Your six ────────────────────────────────────────────────────────────────

export const SIX = 6
export const RECENT_DAYS = 14
// A friend's ranking counts half as much every week: yesterday's is worth ~90%, a
// week-old one 50%, a fortnight-old one 25%.
export const HALF_LIFE_DAYS = 7
// A place you saved starts with this much, before any friend has said a word — about
// what a week-old 9 from a friend is worth — and a friend ranking a place you saved is
// news, so it earns a little more.
export const SAVED_HEAD_START = 5
export const SAVED_FRIEND_BONUS = 2
// Softer nudges: your own neighborhoods, a place still open late once it's evening, and
// a place with no photo (it can still make the six, it just loses ties).
export const HOOD_BOOST = 1.15
export const LATE_BOOST = 1.1
export const LATE_FROM_SD_HOUR = 17
export const NO_PHOTO_FACTOR = 0.9
// No more than this many of the six from one cuisine, or one neighborhood.
export const MAX_PER_CUISINE = 2
export const MAX_PER_HOOD = 3

// How much one friend's ranking says about you: their score (stored 0–100, so /10),
// faded by age, scaled by how alike your tastes are — a 100% match counts in full, an
// unknown or 50% match three-quarters, a 0% match half. `match` is tasteMatch()'s
// 0–100 (null under 3 shared places = no evidence either way = the middle).
export function recencyDecay(ageDays: number): number {
  return 0.5 ** (Math.max(0, ageDays) / HALF_LIFE_DAYS)
}
export function friendSignal(score: number, ageDays: number, match: number | null): number {
  return (score / 10) * recencyDecay(ageDays) * (0.5 + 0.5 * ((match ?? 50) / 100))
}

// "Open late": the venue closes at 11 PM or after. `closesAt` is a display label
// ("11p", "12a", "1a"), not a parsed time — see restaurants.closesAt.
export function closesLate(closesAt: string | null | undefined): boolean {
  const m = /^(\d{1,2})([ap])$/i.exec((closesAt ?? '').trim())
  if (!m) return false
  const hour = Number(m[1])
  if (hour < 1 || hour > 12) return false
  return m[2]!.toLowerCase() === 'a' || hour === 11
}

export type FriendSignal = {
  name: string
  // Stored score, 0–100.
  score: number
  ageDays: number
  // tasteMatch() with this friend, 0–100, or null.
  match: number | null
}

export type SixCandidate = {
  id: string
  cuisine: string | null
  neighborhoodId: string
  hasPhoto: boolean
  closesAt: string | null
  saved: boolean
  // The place is in one of the member's own neighborhoods.
  ownHood: boolean
  friends: FriendSignal[]
  // Set only on the citywide fill candidates (see rankSix): a small standing score for
  // a place the city is ranking, used when the member's own signals run out.
  trending: number
}

// Why a place is in the six, as data — the client words it (both languages).
export type SixReason =
  | { kind: 'friend'; name: string; score: number; more: number }
  | { kind: 'saved_friends'; count: number }
  | { kind: 'saved' }
  | { kind: 'trending' }

export function sixScore(c: SixCandidate, sdHour: number): number {
  let s = c.friends.reduce((sum, f) => sum + friendSignal(f.score, f.ageDays, f.match), 0)
  if (c.saved) s += SAVED_HEAD_START + (c.friends.length > 0 ? SAVED_FRIEND_BONUS : 0)
  if (s === 0) s = c.trending
  if (c.ownHood) s *= HOOD_BOOST
  if (sdHour >= LATE_FROM_SD_HOUR && closesLate(c.closesAt)) s *= LATE_BOOST
  if (!c.hasPhoto) s *= NO_PHOTO_FACTOR
  return s
}

export function sixReason(c: SixCandidate): SixReason {
  const top = [...c.friends].sort(
    (a, b) => friendSignal(b.score, b.ageDays, b.match) - friendSignal(a.score, a.ageDays, a.match),
  )[0]
  if (top && c.saved) return { kind: 'saved_friends', count: c.friends.length }
  if (top) return { kind: 'friend', name: top.name, score: top.score, more: c.friends.length - 1 }
  if (c.saved) return { kind: 'saved' }
  return { kind: 'trending' }
}

// The six, best first. Candidates are places the member hasn't ranked and that are open
// (the query's job); this applies the rest:
//   · at most MAX_PER_CUISINE from one cuisine and MAX_PER_HOOD from one neighborhood;
//   · at least one saved place, when any qualifies, even a quiet one;
//   · citywide-trending candidates (`trending > 0`) only fill what the member's own
//     friends and saves leave empty, so a member with friends never sees the crowd.
// Deterministic: ties fall to the id.
export function rankSix<C extends SixCandidate>(
  candidates: C[],
  sdHour: number,
): { candidate: C; reason: SixReason }[] {
  const scored = (list: C[]) =>
    list
      .map((candidate) => ({ candidate, score: sixScore(candidate, sdHour) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || a.candidate.id.localeCompare(b.candidate.id))

  const picked: C[] = []
  const cuisines = new Map<string, number>()
  const hoods = new Map<string, number>()
  const fits = (c: C) =>
    (!c.cuisine || (cuisines.get(c.cuisine.toLowerCase()) ?? 0) < MAX_PER_CUISINE) &&
    (hoods.get(c.neighborhoodId) ?? 0) < MAX_PER_HOOD
  const take = (c: C) => {
    picked.push(c)
    if (c.cuisine)
      cuisines.set(c.cuisine.toLowerCase(), (cuisines.get(c.cuisine.toLowerCase()) ?? 0) + 1)
    hoods.set(c.neighborhoodId, (hoods.get(c.neighborhoodId) ?? 0) + 1)
  }

  const own = scored(candidates.filter((c) => c.trending === 0))
  // Reserve a saved place first, so the caps and the scores below can't crowd it out.
  const firstSaved = own.find((x) => x.candidate.saved)
  if (firstSaved) take(firstSaved.candidate)
  for (const { candidate } of own) {
    if (picked.length >= SIX) break
    if (!picked.includes(candidate) && fits(candidate)) take(candidate)
  }
  if (picked.length < SIX) {
    for (const { candidate } of scored(candidates.filter((c) => c.trending > 0))) {
      if (picked.length >= SIX) break
      if (fits(candidate)) take(candidate)
    }
  }
  return picked
    .map((candidate) => ({ candidate, score: sixScore(candidate, sdHour) }))
    .sort((a, b) => b.score - a.score || a.candidate.id.localeCompare(b.candidate.id))
    .map(({ candidate }) => ({ candidate, reason: sixReason(candidate) }))
}

// ── Tonight ─────────────────────────────────────────────────────────────────

export const TONIGHT_MAX = 5

export type TonightEvent = {
  id: string
  startsAt: Date
  friendsGoing: unknown[]
  savedByMe: boolean
}

// Up to five events for tonight's card: where your friends are going first, then what's
// on right now, then soonest, then what you saved. `events` is already tonight's window
// (not cancelled, not over) — this only orders and trims.
export function selectTonight<E extends TonightEvent>(events: E[], now: Date): E[] {
  const rank = (e: E) => [
    e.friendsGoing.length > 0 ? 0 : 1,
    e.startsAt.getTime() <= now.getTime() ? 0 : 1,
    e.startsAt.getTime(),
    e.savedByMe ? 0 : 1,
  ]
  return [...events]
    .sort((a, b) => {
      const ra = rank(a)
      const rb = rank(b)
      for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i]! - rb[i]!
      return a.id.localeCompare(b.id)
    })
    .slice(0, TONIGHT_MAX)
}

// "Tonight's pick", for a night with no events: the place still open late that your
// friends ranked highest — one the member hasn't ranked and that isn't already in the
// six. Highest friend score wins; a tie goes to the place more friends ranked.
export type PickRow = {
  restaurantId: string
  userId: string
  userName: string
  score: number
  closesAt: string | null
}
export function pickTonight<R extends PickRow>(
  rows: R[],
  excludeIds: Set<string>,
): { row: R; friendCount: number } | null {
  const byPlace = new Map<string, R[]>()
  for (const r of rows) {
    if (excludeIds.has(r.restaurantId) || !closesLate(r.closesAt)) continue
    byPlace.set(r.restaurantId, [...(byPlace.get(r.restaurantId) ?? []), r])
  }
  const places = [...byPlace.values()].map((list) => ({
    row: list.reduce((best, r) => (r.score > best.score ? r : best)),
    friendCount: new Set(list.map((r) => r.userId)).size,
  }))
  places.sort(
    (a, b) =>
      b.row.score - a.row.score ||
      b.friendCount - a.friendCount ||
      a.row.restaurantId.localeCompare(b.row.restaurantId),
  )
  return places[0] ?? null
}
