// Post-seed helper: a ready-made TEST ACCOUNT you can log into with a password.
//
// The main `bun db:seed` (in @mesa/db) builds the world but creates no login
// credentials — Better Auth stores the password hash in the `account` table, and
// only Better Auth can produce a compatible hash. So this script runs AFTER the
// seed and mints the account through Better Auth's own signup, then ranks ~80% of
// the restaurants and follows the curated friends so the feed is full.
//
//   bun db:seed                          # rebuild the world (wipes this account)
//   bun run --filter @mesa/api seed:demo # (re)create the test account
//
// Login:  demo@mesa.test  /  mesademo2026
// Idempotent — re-running deletes and recreates the account cleanly.

import { db, pool, schema } from '@mesa/db'
import { asc, eq, inArray, sql } from 'drizzle-orm'
import { auth } from './auth'
import { scoreFor } from './lib/score'

const EMAIL = 'demo@mesa.test'
const PASSWORD = 'mesademo2026'
const NAME = 'Demo Tester'
const HANDLE = 'demo'
const HOME_SLUG = 'piantini'
const CURATED = ['caro', 'dieguito', 'valen', 'isa', 'mateo', 'lucia', 'rafa', 'nati']

// Deterministic shuffle so the ranked set is the same every run.
function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

async function main() {
  const { user, rankings, follows, neighborhoods, restaurants, savedPlaces } = schema

  // 1) Clean slate — delete any prior demo account (cascades everything).
  await db.delete(user).where(eq(user.email, EMAIL))

  // 2) Create the account through Better Auth (mints user + hashed credential).
  await auth.api.signUpEmail({ body: { email: EMAIL, password: PASSWORD, name: NAME } })
  const me = await db.query.user.findFirst({ where: eq(user.email, EMAIL), columns: { id: true } })
  if (!me) throw new Error('signUpEmail did not create the user')

  // 3) Complete the profile so it lands in the app, not onboarding.
  const hood = await db.query.neighborhoods.findFirst({
    where: eq(neighborhoods.slug, HOME_SLUG),
    columns: { id: true },
  })
  await db
    .update(user)
    .set({
      handle: HANDLE,
      neighborhoodId: hood?.id ?? null,
      bio: 'Test account — ranked most of Santo Domingo.',
      eulaAcceptedAt: new Date(),
      emailVerified: true,
      updatedAt: new Date(),
    })
    .where(eq(user.id, me.id))

  // 4) Rank ~80% of the restaurants (dense positions + derived scores).
  const all = await db
    .select({ id: restaurants.id })
    .from(restaurants)
    .orderBy(asc(restaurants.name))
  const rand = mulberry32(2026)
  const shuffled = [...all].sort(() => rand() - 0.5)
  const take = Math.round(all.length * 0.8)
  const ranked = shuffled.slice(0, take)
  await db.insert(rankings).values(
    ranked.map((r, i) => ({
      userId: me.id,
      restaurantId: r.id,
      position: i + 1,
      score: scoreFor(i, ranked.length),
    })),
  )

  // 5) Save a couple of the rest as "want to try".
  const rest = shuffled.slice(take)
  if (rest.length > 0) {
    await db
      .insert(savedPlaces)
      .values(rest.slice(0, 3).map((r) => ({ userId: me.id, restaurantId: r.id })))
      .onConflictDoNothing()
  }

  // 6) Follow the curated friends so the feed + taste-match are populated.
  const friends = await db.select({ id: user.id }).from(user).where(inArray(user.handle, CURATED))
  if (friends.length > 0) {
    await db
      .insert(follows)
      .values(friends.map((f) => ({ followerId: me.id, followingId: f.id })))
      .onConflictDoNothing()
  }

  const total = (
    await db
      .select({ n: sql<number>`count(*)::int` })
      .from(rankings)
      .where(eq(rankings.userId, me.id))
  )[0]?.n
  console.log(
    `✓ test account ready — ${EMAIL} / ${PASSWORD}\n` +
      `  ${total} of ${all.length} restaurants ranked (~${Math.round((take / all.length) * 100)}%), ` +
      `${friends.length} friends followed, ${Math.min(rest.length, 3)} saved.`,
  )
}

main()
  .then(() => pool.end())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
