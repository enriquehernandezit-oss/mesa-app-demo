import { db, schema } from '@mesa/db'
import { and, desc, eq, isNull, notInArray, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { Context } from 'hono'
import { Hono } from 'hono'
import { z } from 'zod'
import type { AuthedEnv } from '../context'
import { sendPush } from '../lib/push'
import { blockedByMe, blockedMe } from '../lib/visibility'
import { requireAuth } from '../middleware/session'

// The social graph write side. Follow/unfollow is used first during onboarding
// friend-find; the discovery feed that reads this graph lands in M4.

const followSchema = z.object({ userId: z.string().min(1) })

// Shared by GET /followers and GET /following: resolve which user's graph is
// being read (me, or ?userId=someone-else) and refuse — with the same
// "not_found" a banned or nonexistent user gets, never a distinguishing error
// — if that person is banned or a block exists in either direction.
async function resolveGraphTarget(
  c: Context<AuthedEnv>,
  me: { id: string },
): Promise<string | null> {
  const targetId = c.req.query('userId') || me.id
  if (targetId === me.id) return targetId

  const target = await db.query.user.findFirst({
    where: eq(schema.user.id, targetId),
    columns: { bannedAt: true },
  })
  if (!target || target.bannedAt) return null

  const blocked = await db.query.userBlocks.findFirst({
    where: or(
      and(eq(schema.userBlocks.blockerId, me.id), eq(schema.userBlocks.blockedId, targetId)),
      and(eq(schema.userBlocks.blockerId, targetId), eq(schema.userBlocks.blockedId, me.id)),
    ),
    columns: { blockerId: true },
  })
  if (blocked) return null

  return targetId
}

export const socialRoutes = new Hono<AuthedEnv>()
  .use(requireAuth)

  .post('/follow', async (c) => {
    const current = c.get('user')

    const parsed = followSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400)
    const targetId = parsed.data.userId
    if (targetId === current.id) {
      return c.json({ error: 'cannot_follow_self' }, 400)
    }

    // A block deletes any existing follow edge (see /moderation/blocks), but
    // nothing previously stopped re-following a blocker (or someone you'd
    // blocked) right back through this endpoint. Same "not_found" a banned
    // or nonexistent target gets — this never confirms to the caller whether
    // a block exists, just that following isn't possible.
    const target = await db.query.user.findFirst({
      where: eq(schema.user.id, targetId),
      columns: { bannedAt: true },
    })
    if (!target || target.bannedAt) return c.json({ error: 'not_found' }, 404)

    const blocked = await db.query.userBlocks.findFirst({
      where: or(
        and(eq(schema.userBlocks.blockerId, current.id), eq(schema.userBlocks.blockedId, targetId)),
        and(eq(schema.userBlocks.blockerId, targetId), eq(schema.userBlocks.blockedId, current.id)),
      ),
      columns: { blockerId: true },
    })
    if (blocked) return c.json({ error: 'not_found' }, 404)

    // Idempotent: following someone you already follow is a no-op, not an
    // error — and `.returning()` is how the push trigger tells "new follow"
    // from "already following", so a repeat tap of a Follow button never
    // re-notifies.
    const inserted = await db
      .insert(schema.follows)
      .values({ followerId: current.id, followingId: targetId })
      .onConflictDoNothing()
      .returning({ followerId: schema.follows.followerId })

    if (inserted.length > 0) {
      sendPush([
        {
          userId: targetId,
          key: `follow:${current.id}:${targetId}`,
          category: 'social',
          title: 'Mesa',
          body: `${current.name || 'Alguien'} te empezó a seguir`,
          data: { type: 'user', userId: current.id },
        },
      ])
    }

    return c.json({ ok: true })
  })

  .delete('/follow/:userId', async (c) => {
    const current = c.get('user')

    await db
      .delete(schema.follows)
      .where(
        and(
          eq(schema.follows.followerId, current.id),
          eq(schema.follows.followingId, c.req.param('userId')),
        ),
      )

    return c.json({ ok: true })
  })

  // Resolve a public @handle to a user id. Shared profile links address people by
  // handle (`/p/u/@ana`), but every in-app profile route is keyed by id — so the
  // app hits this once when a shared link opens, then navigates to /u/<id>.
  // Exact match only: this is link resolution, not search (that lives in the
  // explore endpoint and is deliberately fuzzy).
  .get('/by-handle/:handle', async (c) => {
    const handle = c.req.param('handle').replace(/^@/, '').toLowerCase()
    if (!handle) return c.json({ error: 'not_found' }, 404)

    const target = await db.query.user.findFirst({
      where: eq(schema.user.handle, handle),
      columns: { id: true, bannedAt: true },
    })
    // A banned account's link resolves to nothing rather than a dead profile.
    if (!target || target.bannedAt) return c.json({ error: 'not_found' }, 404)

    return c.json({ userId: target.id })
  })

  // Who follows the target (me by default, or ?userId=). Feeds the tappable
  // "Seguidores" stat and M3's follower-invite picker.
  .get('/followers', async (c) => {
    const me = c.get('user')
    const targetId = await resolveGraphTarget(c, me)
    if (!targetId) return c.json({ error: 'not_found' }, 404)

    // `back` answers "do I (the caller) already follow this row's user" —
    // the same join shape as activity.ts's new-followers section, just keyed
    // off whatever list is being read instead of always my own.
    const back = alias(schema.follows, 'back')
    const users = await db
      .select({
        id: schema.user.id,
        name: schema.user.name,
        handle: schema.user.handle,
        image: schema.user.image,
        neighborhood: schema.neighborhoods.name,
        isFollowing: sql<boolean>`${back.followerId} is not null`,
      })
      .from(schema.follows)
      .innerJoin(schema.user, eq(schema.user.id, schema.follows.followerId))
      .leftJoin(schema.neighborhoods, eq(schema.neighborhoods.id, schema.user.neighborhoodId))
      .leftJoin(
        back,
        and(eq(back.followerId, me.id), eq(back.followingId, schema.follows.followerId)),
      )
      .where(
        and(
          eq(schema.follows.followingId, targetId),
          isNull(schema.user.bannedAt),
          notInArray(schema.user.id, blockedByMe(me.id)),
          notInArray(schema.user.id, blockedMe(me.id)),
        ),
      )
      .orderBy(desc(schema.follows.createdAt))
      .limit(200)

    return c.json({ users })
  })

  // Who the target follows (me by default, or ?userId=). The mirror of
  // /followers — same block/ban filtering, same shape.
  .get('/following', async (c) => {
    const me = c.get('user')
    const targetId = await resolveGraphTarget(c, me)
    if (!targetId) return c.json({ error: 'not_found' }, 404)

    const back = alias(schema.follows, 'back')
    const users = await db
      .select({
        id: schema.user.id,
        name: schema.user.name,
        handle: schema.user.handle,
        image: schema.user.image,
        neighborhood: schema.neighborhoods.name,
        isFollowing: sql<boolean>`${back.followerId} is not null`,
      })
      .from(schema.follows)
      .innerJoin(schema.user, eq(schema.user.id, schema.follows.followingId))
      .leftJoin(schema.neighborhoods, eq(schema.neighborhoods.id, schema.user.neighborhoodId))
      .leftJoin(
        back,
        and(eq(back.followerId, me.id), eq(back.followingId, schema.follows.followingId)),
      )
      .where(
        and(
          eq(schema.follows.followerId, targetId),
          isNull(schema.user.bannedAt),
          notInArray(schema.user.id, blockedByMe(me.id)),
          notInArray(schema.user.id, blockedMe(me.id)),
        ),
      )
      .orderBy(desc(schema.follows.createdAt))
      .limit(200)

    return c.json({ users })
  })
