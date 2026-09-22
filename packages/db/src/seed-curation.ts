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
  // M15 — mirrors the mock data hand-appended to drizzle/0016_living_toad_men.sql's
  // UPDATEs exactly. This script deletes+rebuilds `lists` from scratch on
  // every run, so without these fields here too, a reseed would blank the
  // migration's own mock data right back out. Every creator/venue name is
  // fictional, never a real person or business.
  description: string
  curationNote: string
  authorKind?: 'creator' | 'venue' // omitted = 'mesa', the schema default
  authorName?: string
  authorHandle?: string
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
    description: 'Nuestros rincones favoritos para una noche de pasta fresca y vino tinto.',
    curationNote:
      'Elegidos a mano por Grecia entre los spots italianos mejor puntuados por la comunidad Mesa.',
    authorKind: 'creator',
    authorName: 'Grecia Duval',
    authorHandle: 'greciaeats',
  },
  {
    slug: 'piantini-after-dark',
    title: 'Piantini After Dark',
    subtitle: 'Donde Piantini se queda tarde',
    sortOrder: 2,
    where: ilike(neighborhoods.name, 'Piantini'),
    limit: 12,
    description:
      'Piantini no se duerme — estos son los lugares que se quedan animados hasta tarde.',
    curationNote:
      'Ordenados por la puntuación de tus amigos entre los spots de Piantini con más actividad nocturna.',
  },
  {
    slug: 'mesa-best-2026',
    title: 'Mesa Best · DR 2026',
    subtitle: 'La selección editorial',
    sortOrder: 3,
    where: undefined, // all spots, by score
    limit: 12,
    description: 'Nuestra selección editorial de los mejores lugares de Santo Domingo este año.',
    curationNote:
      'Los spots con mejor puntuación promedio en todo el catálogo de Mesa, revisados por el equipo.',
  },
  {
    slug: 'criolla-clasica',
    title: 'Criolla Clásica',
    subtitle: 'Sabor dominicano de siempre',
    sortOrder: 4,
    where: or(ilike(restaurants.cuisine, '%dominican%'), ilike(restaurants.cuisine, '%criolla%')),
    limit: 10,
    description: 'Los platos de siempre, como los prepara la generación que nos enseñó a cocinar.',
    curationNote: 'Una selección de Comedor Doña Chana — sazón criolla sin atajos, desde 1987.',
    authorKind: 'venue',
    authorName: 'Comedor Doña Chana',
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
        description: def.description,
        curationNote: def.curationNote,
        authorKind: def.authorKind ?? 'mesa',
        authorName: def.authorName,
        authorHandle: def.authorHandle,
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
