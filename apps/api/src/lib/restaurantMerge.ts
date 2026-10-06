// Merging one restaurant row into another, and removing one outright. Used by places:merge and
// places:remove; nothing on a request path calls this.
//
// Restaurants get duplicated (a seed row and its real catalog twin, a name that differs by an
// apostrophe), and a bare DELETE of the twin you don't want is not safe: thirteen tables point at
// a restaurant, and deleting it would
//   • cascade away every member's ranking of it AND leave a hole in their ranked list — a list's
//     positions are dense 1..n and its scores derive from position, so it has to be rewritten the
//     way DELETE /rankings/:id does;
//   • destroy the menu, the Google id and the real pin, which usually sit on the OTHER twin.
// So a merge keeps one row and carries everything of the other across, then deletes it.
//
// "Kept" is chosen by pickSurvivor: the row with the most reviews (rankings), then the one with a
// photo, then the oldest. Each table is handled by how it can collide with the survivor:
//   rankings         a member who ranked both keeps their BETTER entry (its dishes, cheers,
//                    comments and notifications come with it); their list is then rewritten dense.
//   vibe notes       a member with a note on both keeps the more recently edited.
//   saved places, collection items, curated-list items, dish-list items, plan options
//                    keyed by member/collection/list/plan: a collision keeps the survivor's row
//                    (at the better position) and the list is renumbered dense.
//   dishes, events, notifications, plan votes, a plan's chosen place   simply repointed.
//   menu             moves only if the survivor has none — a menu is owned whole by whatever wrote it.
// Then the survivor adopts the loser's facts (adoptFacts) and its photo if it has none, and the
// loser is deleted. Everything is set-based SQL in ONE transaction: it either happens or it doesn't.

import { schema } from '@mesa/db'
import { type SQL, eq, inArray, sql } from 'drizzle-orm'

import type { MesaFieldsFromGoogle } from './googlePlaces'
import { hoursColumns } from './openingHours'
import { isPlaceholderPhone, isPlaceholderWebsite } from './placeContacts'
import { type EnrichPatch, type EnrichRow, enrichPatch } from './placeFacts'
import { type Executor, currentOrder, lockUserList, rewrite } from './rankingOrder'

const { restaurants } = schema

// ── choosing what to keep ────────────────────────────────────────────────

export interface PlaceSummary {
  id: string
  // Rankings — Mesa's word for a review.
  reviews: number
  hasPhoto: boolean
  createdAt: Date
}

export function pickSurvivor<T extends PlaceSummary>(group: T[]): T {
  const [best] = [...group].sort(
    (a, b) =>
      b.reviews - a.reviews ||
      Number(b.hasPhoto) - Number(a.hasPhoto) ||
      a.createdAt.getTime() - b.createdAt.getTime() ||
      a.id.localeCompare(b.id),
  )
  if (!best) throw new Error('pickSurvivor: nothing to choose from')
  return best
}

// ── what the survivor takes from the loser's row ─────────────────────────

export interface MergeRow extends EnrichRow {
  coverImageId: string | null
  sourceRefreshedAt: Date | null
}
export type MergePatch = EnrichPatch & { coverImageId?: string; sourceRefreshedAt?: Date }

// The loser's stored values as if they were a Google answer. Its invented contacts are dropped
// rather than handed on: a fake phone is not a fact about the place.
function factsOf(row: MergeRow): MesaFieldsFromGoogle {
  return {
    name: row.name,
    lat: row.lat,
    lng: row.lng,
    address: row.address,
    locality: row.locality,
    phone: isPlaceholderPhone(row.phone) ? null : row.phone,
    website: isPlaceholderWebsite(row.name, row.website) ? null : row.website,
    priceTier: row.priceTier,
    cuisine: row.cuisine,
    closesAt: row.closesAt,
    closedAt: null,
    openingHours: row.openingHours,
    sublocality: row.googleSublocality,
  }
}

export function adoptFacts(survivor: MergeRow, loser: MergeRow): MergePatch {
  let patch: MergePatch
  if (loser.googlePlaceId && !survivor.googlePlaceId) {
    // The loser IS Google's view of this place — it was imported or enriched from Google — so the
    // survivor takes it the way places:enrich would: id, real pin and neighborhood, real contacts,
    // and any facts it was missing.
    patch = enrichPatch(survivor, factsOf(loser), loser.googlePlaceId, {
      kind: 'sector',
      hoodId: loser.neighborhoodId,
    })
    if (loser.sourceRefreshedAt) patch.sourceRefreshedAt = loser.sourceRefreshedAt
  } else {
    // No Google behind the loser: only fill the survivor's gaps. Its pin is just as hand-placed as
    // the survivor's, so it is not a reason to move anything.
    patch = {}
    const f = factsOf(loser)
    if (survivor.phone == null && f.phone) patch.phone = f.phone
    if (survivor.website == null && f.website) patch.website = f.website
    if (survivor.address == null && f.address) patch.address = f.address
    if (survivor.locality == null && f.locality) patch.locality = f.locality
    if (survivor.priceTier == null && f.priceTier != null) patch.priceTier = f.priceTier
    if (survivor.closesAt == null && f.closesAt) patch.closesAt = f.closesAt
    if (survivor.cuisine == null && f.cuisine) patch.cuisine = f.cuisine
    if (survivor.openingHours == null && f.openingHours)
      Object.assign(patch, hoursColumns(f.openingHours))
  }
  // "Keep the one with the photo": whichever row survives, the photo does too.
  if (survivor.coverImageId == null && loser.coverImageId != null) {
    patch.coverImageId = loser.coverImageId
  }
  return patch
}

// ── the merge itself ─────────────────────────────────────────────────────

// Tables keyed by (something, restaurant): a collision keeps the survivor's row.
const KEYED: readonly { table: string; key: string; firstPosition?: number }[] = [
  { table: 'saved_places', key: 'user_id' },
  { table: 'collection_items', key: 'collection_id' },
  { table: 'list_items', key: 'list_id', firstPosition: 1 },
  { table: 'dish_list_items', key: 'list_id', firstPosition: 1 },
  { table: 'plan_options', key: 'plan_id', firstPosition: 0 },
]

export interface MergeReport {
  // Members' rankings carried onto the survivor.
  rankingsMoved: number
  // Members who had ranked BOTH: their better entry was kept, the other dropped.
  rankingsMerged: number
  // Rows carried across, by table.
  moved: Record<string, number>
  // Columns the survivor took from the loser.
  adopted: string[]
}

const ids = (values: string[]): SQL =>
  sql.join(
    values.map((v) => sql`${v}`),
    sql`, `,
  )
const count = (res: { rowCount: number | null }): number => res.rowCount ?? 0

// Where a member ranked both twins: the row to keep is their better-positioned one.
const pairsCte = (survivor: string, loser: string): SQL => sql`pairs as (
  select case when a.position <= b.position then a.id else b.id end as kept_id,
         case when a.position <= b.position then b.id else a.id end as dropped_id,
         a.user_id as user_id
  from rankings a
  join rankings b on b.user_id = a.user_id
  where a.restaurant_id = ${loser} and b.restaurant_id = ${survivor})`

// Renumber some lists' positions dense again after a collision dropped a row from them.
async function renumber(
  tx: Executor,
  table: string,
  key: string,
  listIds: string[],
  firstPosition: number,
): Promise<void> {
  if (listIds.length === 0) return
  await tx.execute(sql`
    update ${sql.raw(table)} t set position = r.rn + ${firstPosition - 1}
    from (select ${sql.raw(key)} as k, restaurant_id as rid,
                 row_number() over (partition by ${sql.raw(key)} order by position, restaurant_id) as rn
          from ${sql.raw(table)} where ${sql.raw(key)} in (${ids(listIds)})) r
    where t.${sql.raw(key)} = r.k and t.restaurant_id = r.rid`)
}

export async function mergeInto(
  tx: Executor,
  survivorId: string,
  loserId: string,
): Promise<MergeReport> {
  const S = survivorId
  const L = loserId
  if (S === L) throw new Error('mergeInto: a restaurant cannot be merged into itself')
  const moved: Record<string, number> = {}

  // Hold every affected member's list still for the whole merge, in a stable order.
  const affected = await tx.execute(
    sql`select distinct user_id from rankings where restaurant_id in (${S}, ${L}) order by user_id`,
  )
  for (const r of affected.rows as { user_id: string }[]) await lockUserList(tx, r.user_id)

  // ── rankings ──
  const both = await tx.execute(sql`with ${pairsCte(S, L)} select user_id from pairs`)
  const bothUsers = (both.rows as { user_id: string }[]).map((r) => r.user_id)
  if (bothUsers.length > 0) {
    // Hand everything hanging off the dropped ranking to the kept one…
    for (const dependent of ['dishes', 'ranking_comments', 'notifications']) {
      await tx.execute(sql`with ${pairsCte(S, L)}
        update ${sql.raw(dependent)} d set ranking_id = p.kept_id
        from pairs p where d.ranking_id = p.dropped_id`)
    }
    // …cheers are one per member per ranking, so a member who cheered both keeps a single cheer…
    await tx.execute(sql`with ${pairsCte(S, L)}
      update cheers c set ranking_id = p.kept_id from pairs p
      where c.ranking_id = p.dropped_id
        and not exists (select 1 from cheers c2 where c2.ranking_id = p.kept_id and c2.user_id = c.user_id)`)
    // …the kept ranking inherits tags and a favorite dish it lacked…
    await tx.execute(sql`with ${pairsCte(S, L)}
      update rankings k set tags = coalesce(k.tags, d.tags),
                            favorite_dish = coalesce(k.favorite_dish, d.favorite_dish)
      from pairs p join rankings d on d.id = p.dropped_id
      where k.id = p.kept_id`)
  }
  // …then drop the worse entry, and move whatever is left of the loser's rankings across.
  const merged = await tx.execute(sql`with ${pairsCte(S, L)}
    delete from rankings r using pairs p where r.id = p.dropped_id`)
  const rankingsMoved = count(
    await tx.execute(sql`update rankings set restaurant_id = ${S} where restaurant_id = ${L}`),
  )

  // ── vibe notes: the newer of two survives ──
  await tx.execute(sql`
    delete from vibe_notes n using vibe_notes m
    where n.user_id = m.user_id and n.restaurant_id <> m.restaurant_id
      and n.restaurant_id in (${S}, ${L}) and m.restaurant_id in (${S}, ${L})
      and (n.updated_at < m.updated_at or (n.updated_at = m.updated_at and n.restaurant_id = ${L}))`)
  moved.vibe_notes = count(
    await tx.execute(sql`update vibe_notes set restaurant_id = ${S} where restaurant_id = ${L}`),
  )

  // ── keyed tables ──
  for (const { table, key, firstPosition } of KEYED) {
    const t = sql.raw(table)
    const k = sql.raw(key)
    let collided: string[] = []
    if (firstPosition !== undefined) {
      // A collision keeps the survivor's row at the better of the two positions.
      const res = await tx.execute(sql`
        select distinct a.${k} as k from ${t} a join ${t} b on b.${k} = a.${k}
        where a.restaurant_id = ${L} and b.restaurant_id = ${S}`)
      collided = (res.rows as { k: string }[]).map((r) => r.k)
      await tx.execute(sql`
        update ${t} s set position = least(s.position, l.position) from ${t} l
        where s.${k} = l.${k} and s.restaurant_id = ${S} and l.restaurant_id = ${L}`)
    }
    moved[table] = count(
      await tx.execute(sql`
        update ${t} set restaurant_id = ${S}
        where restaurant_id = ${L}
          and ${k} not in (select o.${k} from ${t} o where o.restaurant_id = ${S})`),
    )
    // A row that could not move collided with the survivor's own. Drop it now — before renumbering,
    // or the numbering would still count it and leave a hole once the loser is deleted.
    await tx.execute(sql`delete from ${t} where restaurant_id = ${L}`)
    if (firstPosition !== undefined) await renumber(tx, table, key, collided, firstPosition)
  }

  // ── plain repoints ──
  for (const [table, col] of [
    ['dishes', 'restaurant_id'],
    ['events', 'restaurant_id'],
    ['notifications', 'restaurant_id'],
    ['plan_invites', 'vote_restaurant_id'],
    ['plans', 'chosen_restaurant_id'],
  ] as const) {
    moved[table] = count(
      await tx.execute(
        sql`update ${sql.raw(table)} set ${sql.raw(col)} = ${S} where ${sql.raw(col)} = ${L}`,
      ),
    )
  }

  // ── menu: only if the survivor has none ──
  moved.menu_items = count(
    await tx.execute(sql`
      update menu_items set restaurant_id = ${S}
      where restaurant_id = ${L}
        and not exists (select 1 from menu_items m where m.restaurant_id = ${S})`),
  )

  // ── facts, then the loser goes ──
  const rows = await tx
    .select({
      id: restaurants.id,
      name: restaurants.name,
      lat: restaurants.lat,
      lng: restaurants.lng,
      neighborhoodId: restaurants.neighborhoodId,
      googlePlaceId: restaurants.googlePlaceId,
      phone: restaurants.phone,
      website: restaurants.website,
      address: restaurants.address,
      locality: restaurants.locality,
      priceTier: restaurants.priceTier,
      closesAt: restaurants.closesAt,
      cuisine: restaurants.cuisine,
      openingHours: restaurants.openingHours,
      googleSublocality: restaurants.googleSublocality,
      coverImageId: restaurants.coverImageId,
      sourceRefreshedAt: restaurants.sourceRefreshedAt,
    })
    .from(restaurants)
    .where(inArray(restaurants.id, [S, L]))
  const survivor = rows.find((r) => r.id === S)
  const loser = rows.find((r) => r.id === L)
  if (!survivor || !loser) throw new Error('mergeInto: a restaurant to merge no longer exists')
  const patch = adoptFacts(survivor, loser)

  // Everything that mattered has moved; what is left on the loser (a collision's dropped row)
  // goes with it. Deleting it FIRST frees its Google id for the survivor to take.
  await tx.delete(restaurants).where(eq(restaurants.id, L))
  if (Object.keys(patch).length > 0) {
    await tx
      .update(restaurants)
      .set({ ...patch, ...(patch.lat != null ? { geoPrecision: 'exact' as const } : {}) })
      .where(eq(restaurants.id, S))
  }

  // A member who ranked both now has one fewer place: rewrite their list dense, with fresh scores.
  for (const userId of bothUsers) await rewrite(tx, userId, await currentOrder(tx, userId))

  return {
    rankingsMoved,
    rankingsMerged: count(merged),
    moved,
    adopted: Object.keys(patch),
  }
}

// ── removing a restaurant outright ───────────────────────────────────────

export interface RemoveReport {
  // Everything that hung off the restaurant and went with it, by table.
  removed: Record<string, number>
}

const REMOVE_COUNTS = [
  'rankings',
  'saved_places',
  'dishes',
  'list_items',
  'dish_list_items',
  'collection_items',
  'events',
  'menu_items',
  'notifications',
  'plan_options',
] as const

// What is attached to a restaurant — for showing before deleting it.
export async function attachedTo(
  exec: Pick<Executor, 'execute'>,
  restaurantId: string,
): Promise<Record<string, number>> {
  const res = await exec.execute(
    sql`select ${sql.join(
      REMOVE_COUNTS.map(
        (t) =>
          sql`(select count(*)::int from ${sql.raw(t)} where restaurant_id = ${restaurantId}) as ${sql.raw(t)}`,
      ),
      sql`, `,
    )}`,
  )
  return (res.rows[0] ?? {}) as Record<string, number>
}

export async function removeRestaurant(tx: Executor, restaurantId: string): Promise<RemoveReport> {
  const affected = await tx.execute(
    sql`select distinct user_id from rankings where restaurant_id = ${restaurantId} order by user_id`,
  )
  const users = (affected.rows as { user_id: string }[]).map((r) => r.user_id)
  for (const userId of users) await lockUserList(tx, userId)

  const removed = await attachedTo(tx, restaurantId)
  // Cascades take the rankings, dishes, saves, notes, menu and the rest with it; a plan that had
  // chosen it, or a vote for it, just lose the reference.
  await tx.delete(restaurants).where(eq(restaurants.id, restaurantId))

  // Each affected member's list lost a place: rewrite it dense, with fresh scores.
  for (const userId of users) await rewrite(tx, userId, await currentOrder(tx, userId))
  return { removed }
}
