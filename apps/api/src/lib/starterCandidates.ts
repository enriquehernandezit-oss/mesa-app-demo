// The places sign-up offers for the starter list. The curated cluster comes first (demo rows and
// editorial-list rows, most-ranked first), because a newcomer's first impression should be places
// they recognise. But that cluster can be thin or empty on a database that never had the demo seed,
// and an empty list left the "Rank these" button disabled with no way forward. So when fewer than
// MIN_STARTER_CANDIDATES come back, the rest of the live catalog tops it up, most-ranked first.
import { schema } from '@mesa/db'
import { and, asc, eq, inArray, isNull, notInArray, or, sql } from 'drizzle-orm'

import type { Executor } from './rankingOrder'

export const STARTER_CANDIDATES = 20
export const MIN_STARTER_CANDIDATES = 5

export interface StarterCandidate {
  id: string
  name: string
  cuisine: string | null
  coverImageId: string | null
  neighborhood: { slug: string; name: string } | null
}

async function pick(exec: Executor, curatedOnly: boolean, skip: string[], limit: number) {
  const inAnyList = exec
    .selectDistinct({ id: schema.listItems.restaurantId })
    .from(schema.listItems)
  const rows = await exec
    .select({
      id: schema.restaurants.id,
      name: schema.restaurants.name,
      cuisine: schema.restaurants.cuisine,
      coverImageId: schema.restaurants.coverImageId,
      neighborhoodSlug: schema.neighborhoods.slug,
      neighborhoodName: schema.neighborhoods.name,
    })
    .from(schema.restaurants)
    .leftJoin(schema.neighborhoods, eq(schema.neighborhoods.id, schema.restaurants.neighborhoodId))
    .leftJoin(schema.rankings, eq(schema.rankings.restaurantId, schema.restaurants.id))
    .where(
      and(
        isNull(schema.restaurants.removedAt),
        isNull(schema.restaurants.closedAt),
        curatedOnly
          ? or(eq(schema.restaurants.isDemo, true), inArray(schema.restaurants.id, inAnyList))
          : undefined,
        skip.length > 0 ? notInArray(schema.restaurants.id, skip) : undefined,
      ),
    )
    .groupBy(schema.restaurants.id, schema.neighborhoods.slug, schema.neighborhoods.name)
    .orderBy(sql`count(${schema.rankings.id}) desc`, asc(schema.restaurants.name))
    .limit(limit)
  return rows.map(({ neighborhoodSlug, neighborhoodName, ...r }) => ({
    ...r,
    neighborhood:
      neighborhoodSlug && neighborhoodName
        ? { slug: neighborhoodSlug, name: neighborhoodName }
        : null,
  }))
}

export async function starterCandidates(exec: Executor): Promise<StarterCandidate[]> {
  const curated = await pick(exec, true, [], STARTER_CANDIDATES)
  if (curated.length >= MIN_STARTER_CANDIDATES) return curated
  const more = await pick(
    exec,
    false,
    curated.map((r) => r.id),
    STARTER_CANDIDATES - curated.length,
  )
  return [...curated, ...more]
}
