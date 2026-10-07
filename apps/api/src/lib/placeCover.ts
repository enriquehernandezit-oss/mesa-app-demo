import { db, schema } from '@mesa/db'
import { and, eq, isNotNull } from 'drizzle-orm'

// Every place a member has a dish photo on — the places whose cover can change when that member's
// account does (goes private, is banned, is erased). The rule itself is refreshPlaceCovers in @mesa/db.
export async function placesWithPhotosBy(userId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ id: schema.dishes.restaurantId })
    .from(schema.dishes)
    .where(and(eq(schema.dishes.userId, userId), isNotNull(schema.dishes.imageId)))
  return rows.map((r) => r.id)
}
