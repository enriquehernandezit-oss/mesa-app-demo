import { and, inArray, sql } from 'drizzle-orm'

import { type Db, db } from './client'
import { dishCheers, dishes, restaurants, user } from './schema'

// A place's picture is a member's dish photo and nothing else: the most cheered, then the newest, among
// dishes their owner marked public, on a public account that is not banned. No such photo means no cover
// (the app draws Mesa's own). It is stored on the place (restaurants.coverImageId) so the dozens of
// lists and cards that show a place keep reading one column; this recomputes it whenever a photo, a
// dish's removal, an account's privacy or a ban could change the answer. Migration 0043 is the same
// rule applied to everything that existed, and the seed calls this once its dishes are in.
const bestDishPhoto = sql`(
  select ${dishes.imageId} from ${dishes}
  inner join ${user} on ${user.id} = ${dishes.userId}
  where ${dishes.restaurantId} = ${restaurants.id}
    and ${dishes.removedAt} is null
    and ${dishes.imageId} is not null
    and ${dishes.visibility} = 'public'
    and ${user.isPrivate} = false
    and ${user.bannedAt} is null
  order by (select count(*) from ${dishCheers} where ${dishCheers.dishId} = ${dishes.id}) desc,
    ${dishes.createdAt} desc
  limit 1
)`

// With no ids, every place.
export async function refreshPlaceCovers(
  restaurantIds?: string[],
  database: Db = db,
): Promise<void> {
  if (restaurantIds && restaurantIds.length === 0) return
  await database
    .update(restaurants)
    .set({ coverImageId: bestDishPhoto })
    .where(
      and(
        restaurantIds ? inArray(restaurants.id, restaurantIds) : undefined,
        sql`${restaurants.coverImageId} is distinct from ${bestDishPhoto}`,
      ),
    )
}
