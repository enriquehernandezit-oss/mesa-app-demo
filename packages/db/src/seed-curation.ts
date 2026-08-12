import { eq, ilike, or, sql } from 'drizzle-orm'
import { db } from './client'
import * as schema from './schema'

// Editorial curated lists. Additive + idempotent (clears then rebuilds), so it
// can run against the live demo without a full re-seed. Members are chosen by
// simple criteria and ordered by their all-Mesa average, and the list cover
// reuses the top member's photo so it always resolves.
type Database = typeof db

const { lists, listItems, restaurants, neighborhoods, rankings } = schema

interface ListDef {
  slug: string
  title: string
  subtitle: string
  sortOrder: number
  where?: ReturnType<typeof or> | ReturnType<typeof ilike>
  limit: number
}

const LISTS: ListDef[] = [
  {
    slug: 'la-dolce-vita',
    title: 'La Dolce Vita',
    subtitle: 'Pasta, pizza y vino tinto',
    sortOrder: 1,
    where: or(
      ilike(restaurants.cuisine, '%italian%'),
      ilike(restaurants.cuisine, '%pizza%'),
      ilike(restaurants.cuisine, '%pasta%'),
    ),
    limit: 10,
  },
  {
    slug: 'piantini-after-dark',
    title: 'Piantini After Dark',
    subtitle: 'Donde Piantini se queda tarde',
    sortOrder: 2,
    where: ilike(neighborhoods.name, 'Piantini'),
    limit: 12,
  },
  {
    slug: 'mesa-best-2026',
    title: 'Mesa Best · DR 2026',
    subtitle: 'La selección editorial',
    sortOrder: 3,
    where: undefined, // all spots, by score
    limit: 12,
  },
  {
    slug: 'criolla-clasica',
    title: 'Criolla Clásica',
    subtitle: 'Sabor dominicano de siempre',
    sortOrder: 4,
    where: or(ilike(restaurants.cuisine, '%dominican%'), ilike(restaurants.cuisine, '%criolla%')),
    limit: 10,
  },
]

export async function seedCuration(database: Database = db): Promise<number> {
  await database.delete(listItems)
  await database.delete(lists)

  let made = 0
  for (const def of LISTS) {
    const rows = await database
      .select({ id: restaurants.id, cover: restaurants.coverImageId })
      .from(restaurants)
      .leftJoin(neighborhoods, eq(neighborhoods.id, restaurants.neighborhoodId))
      .leftJoin(rankings, eq(rankings.restaurantId, restaurants.id))
      .where(def.where)
      .groupBy(restaurants.id)
      .orderBy(sql`avg(${rankings.score}) desc nulls last`)
      .limit(def.limit)
    const top = rows[0]
    if (!top) continue

    const [list] = await database
      .insert(lists)
      .values({
        slug: def.slug,
        title: def.title,
        subtitle: def.subtitle,
        coverImageId: top.cover,
        sortOrder: def.sortOrder,
      })
      .returning({ id: lists.id })
    if (!list) continue

    await database
      .insert(listItems)
      .values(rows.map((r, i) => ({ listId: list.id, restaurantId: r.id, position: i + 1 })))
    made += 1
  }
  return made
}
