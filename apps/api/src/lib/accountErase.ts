import { db, refreshPlaceCovers, schema } from '@mesa/db'
import { eq, inArray, sql } from 'drizzle-orm'

import { throttleKey } from './authThrottle'
import { placesWithPhotosBy } from './placeCover'
import { deleteUserPhotos } from './r2'
import { matchBudgetKey } from './usageBudget'

const { authThrottle, usageCounter, user, verification, waitlist } = schema

// What deleting an account removes, beyond the user row's own cascade (every table the member owns
// is ON DELETE CASCADE from `user`): their photos in R2, and the rows that are keyed by their
// email or id rather than by a foreign key — failed-sign-in counters, the waitlist, pending
// verification links, daily budgets. The privacy policy says these are deleted; this is the code
// that does it.
//
// Photos go first and a failure there is logged, not fatal: the member asked to leave, and the
// account must go whether or not the bucket answers.
export async function eraseAccount(member: {
  id: string
  email: string
}): Promise<{ photos: number | null }> {
  let photos: number | null = null
  try {
    photos = await deleteUserPhotos(member.id)
  } catch (err) {
    console.error('account erase: photo cleanup failed', err instanceof Error ? err.message : err)
  }

  // Places that wear one of their photos as the picture get the next best one (or none).
  const places = await placesWithPhotosBy(member.id)
  const email = member.email.trim().toLowerCase()
  await db.transaction(async (tx) => {
    await tx.delete(user).where(eq(user.id, member.id))
    await tx
      .delete(authThrottle)
      .where(inArray(authThrottle.key, [throttleKey(email), `delete:${member.id}`]))
    await tx.delete(usageCounter).where(eq(usageCounter.key, matchBudgetKey(member.id)))
    await tx.delete(waitlist).where(sql`lower(${waitlist.email}) = ${email}`)
    await tx.delete(verification).where(sql`lower(${verification.identifier}) = ${email}`)
  })
  await refreshPlaceCovers(places)
  return { photos }
}
