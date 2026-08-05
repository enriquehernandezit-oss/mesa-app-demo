import { db, schema } from '@mesa/db'
import { and, desc, eq, isNull, or } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../context'
import { requireAuth, requireModerator } from '../middleware/session'

// UGC moderation (App Store 1.2). Every user can report content and block
// abusive accounts; moderators can remove content and eject users. A block hides
// content both ways; a removed note and a banned user disappear from all reads.
const { reports, userBlocks, vibeNotes, follows, user } = schema

const reportSchema = z.object({
  targetType: z.enum(['vibe_note', 'user']),
  targetId: z.string().min(1),
  reason: z.string().trim().min(1).max(500),
})
const blockSchema = z.object({ userId: z.string().min(1) })

export const moderationRoutes = new Hono<AppEnv>()
  .use(requireAuth)

  // --- Any user ---

  // Report a vibe note or a user. Filed for review; no state change to the
  // target here (that's a moderator action).
  .post('/reports', async (c) => {
    const me = c.get('user')
    if (!me) return c.json({ error: 'unauthorized' }, 401)
    const parsed = reportSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400)
    await db.insert(reports).values({
      reporterId: me.id,
      targetType: parsed.data.targetType,
      targetId: parsed.data.targetId,
      reason: parsed.data.reason,
    })
    return c.json({ ok: true })
  })

  // My blocked accounts (for a management screen).
  .get('/blocks', async (c) => {
    const me = c.get('user')
    if (!me) return c.json({ error: 'unauthorized' }, 401)
    const rows = await db
      .select({ id: user.id, name: user.name, handle: user.handle, image: user.image })
      .from(userBlocks)
      .innerJoin(user, eq(user.id, userBlocks.blockedId))
      .where(eq(userBlocks.blockerId, me.id))
      .orderBy(desc(userBlocks.createdAt))
    return c.json({ blocked: rows })
  })

  // Block a user. Also severs the follow edges both ways so their content leaves
  // your graph immediately; the feed/profile reads additionally filter on the
  // block, so nothing of theirs surfaces even if a follow lingered.
  .post('/blocks', async (c) => {
    const me = c.get('user')
    if (!me) return c.json({ error: 'unauthorized' }, 401)
    const parsed = blockSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400)
    const { userId } = parsed.data
    if (userId === me.id) return c.json({ error: 'cannot_block_self' }, 400)

    await db.transaction(async (tx) => {
      await tx
        .insert(userBlocks)
        .values({ blockerId: me.id, blockedId: userId })
        .onConflictDoNothing()
      await tx
        .delete(follows)
        .where(
          or(
            and(eq(follows.followerId, me.id), eq(follows.followingId, userId)),
            and(eq(follows.followerId, userId), eq(follows.followingId, me.id)),
          ),
        )
    })
    return c.json({ ok: true })
  })

  .delete('/blocks/:userId', async (c) => {
    const me = c.get('user')
    if (!me) return c.json({ error: 'unauthorized' }, 401)
    await db
      .delete(userBlocks)
      .where(and(eq(userBlocks.blockerId, me.id), eq(userBlocks.blockedId, c.req.param('userId'))))
    return c.json({ ok: true })
  })

  // --- Moderator only (remove content / eject users) ---

  // Open reports queue.
  .get('/reports', requireModerator, async (c) => {
    const rows = await db
      .select()
      .from(reports)
      .where(eq(reports.status, 'open'))
      .orderBy(desc(reports.createdAt))
      .limit(100)
    return c.json({ reports: rows })
  })

  // Remove a vibe note (soft-delete). It vanishes from every read; the row is
  // kept for audit. Any open reports pointing at it are marked actioned.
  .delete('/vibe-notes/:id', requireModerator, async (c) => {
    const id = c.req.param('id')
    await db.transaction(async (tx) => {
      await tx
        .update(vibeNotes)
        .set({ removedAt: new Date() })
        .where(and(eq(vibeNotes.id, id), isNull(vibeNotes.removedAt)))
      await tx
        .update(reports)
        .set({ status: 'actioned' })
        .where(
          and(
            eq(reports.targetType, 'vibe_note'),
            eq(reports.targetId, id),
            eq(reports.status, 'open'),
          ),
        )
    })
    return c.json({ ok: true })
  })

  // Eject (ban) a user. The ban gate in requireAuth then rejects them
  // everywhere; their content is filtered from reads.
  .post('/users/:userId/eject', requireModerator, async (c) => {
    const me = c.get('user')
    if (!me) return c.json({ error: 'unauthorized' }, 401)
    const targetId = c.req.param('userId')
    if (targetId === me.id) return c.json({ error: 'cannot_eject_self' }, 400)
    await db.transaction(async (tx) => {
      await tx.update(user).set({ bannedAt: new Date() }).where(eq(user.id, targetId))
      await tx
        .update(reports)
        .set({ status: 'actioned' })
        .where(
          and(
            eq(reports.targetType, 'user'),
            eq(reports.targetId, targetId),
            eq(reports.status, 'open'),
          ),
        )
    })
    return c.json({ ok: true })
  })
