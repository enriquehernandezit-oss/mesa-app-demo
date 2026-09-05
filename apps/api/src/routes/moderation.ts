import { db, schema } from '@mesa/db'
import { and, desc, eq, inArray, isNull, or } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import type { AuthedEnv } from '../context'
import { requireAuth, requireModerator } from '../middleware/session'

// UGC moderation (App Store 1.2). Every user can report content and block
// abusive accounts; moderators can remove content and eject users. A block hides
// content both ways; a removed note and a banned user disappear from all reads.
const { reports, userBlocks, vibeNotes, dishes, follows, user } = schema

const reportSchema = z.object({
  // Dishes are first-class UGC (photo + name + caption), so they must be
  // reportable like vibe notes and users (App Store 1.2). The enum already
  // carries 'dish' (schema/enums.ts).
  targetType: z.enum(['vibe_note', 'user', 'dish']),
  targetId: z.string().min(1),
  reason: z.string().trim().min(1).max(500),
})
const blockSchema = z.object({ userId: z.string().min(1) })

export const moderationRoutes = new Hono<AuthedEnv>()
  .use(requireAuth)

  // --- Any user ---

  // Report a vibe note or a user. Filed for review; no state change to the
  // target here (that's a moderator action).
  .post('/reports', async (c) => {
    const me = c.get('user')
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
    await db
      .delete(userBlocks)
      .where(and(eq(userBlocks.blockerId, me.id), eq(userBlocks.blockedId, c.req.param('userId'))))
    return c.json({ ok: true })
  })

  // --- Moderator only (remove content / eject users) ---

  // Open reports queue.
  // The moderation queue. Returns open reports WITH the reported content
  // attached — a bare targetId is undecidable: nobody can judge "vibe_note
  // 3f2a… / spam" without seeing the sentence. Batched by type (four queries
  // total, whatever the report count) rather than looked up per row.
  .get('/reports', requireModerator, async (c) => {
    const rows = await db
      .select()
      .from(reports)
      .where(eq(reports.status, 'open'))
      .orderBy(desc(reports.createdAt))
      .limit(100)
    if (rows.length === 0) return c.json({ reports: [] })

    const idsOf = (t: (typeof rows)[number]['targetType']) =>
      rows.filter((r) => r.targetType === t).map((r) => r.targetId)
    const noteIds = idsOf('vibe_note')
    const dishIds = idsOf('dish')
    const userIds = idsOf('user')

    const [notes, dishRows, users] = await Promise.all([
      noteIds.length
        ? db
            .select({ id: vibeNotes.id, body: vibeNotes.body, removedAt: vibeNotes.removedAt })
            .from(vibeNotes)
            .where(inArray(vibeNotes.id, noteIds))
        : [],
      dishIds.length
        ? db
            .select({
              id: dishes.id,
              name: dishes.name,
              caption: dishes.caption,
              imageId: dishes.imageId,
              removedAt: dishes.removedAt,
            })
            .from(dishes)
            .where(inArray(dishes.id, dishIds))
        : [],
      userIds.length
        ? db
            .select({
              id: user.id,
              name: user.name,
              handle: user.handle,
              bannedAt: user.bannedAt,
            })
            .from(user)
            .where(inArray(user.id, userIds))
        : [],
    ])

    const noteById = new Map(notes.map((n) => [n.id, n]))
    const dishById = new Map(dishRows.map((d) => [d.id, d]))
    const userById = new Map(users.map((u) => [u.id, u]))

    // `target` is null when the row is already gone (deleted account, hard
    // delete) — the queue still shows the report so it can be dismissed.
    // `alreadyHandled` lets the UI grey out a report whose content another
    // moderator (or the author) already removed.
    const enriched = rows.map((r) => {
      if (r.targetType === 'vibe_note') {
        const n = noteById.get(r.targetId)
        return {
          ...r,
          target: n ? { kind: 'vibe_note' as const, body: n.body } : null,
          alreadyHandled: n ? n.removedAt !== null : true,
        }
      }
      if (r.targetType === 'dish') {
        const d = dishById.get(r.targetId)
        return {
          ...r,
          target: d
            ? { kind: 'dish' as const, name: d.name, caption: d.caption, imageId: d.imageId }
            : null,
          alreadyHandled: d ? d.removedAt !== null : true,
        }
      }
      const u = userById.get(r.targetId)
      return {
        ...r,
        target: u ? { kind: 'user' as const, name: u.name, handle: u.handle } : null,
        alreadyHandled: u ? u.bannedAt !== null : true,
      }
    })
    return c.json({ reports: enriched })
  })

  // Close a report without acting on it — the "reviewed, nothing wrong here"
  // path. Without it the queue only ever grows: every other moderator action
  // marks reports 'actioned', but an unfounded report would stay open forever.
  .post('/reports/:id/dismiss', requireModerator, async (c) => {
    const updated = await db
      .update(reports)
      .set({ status: 'dismissed' })
      .where(and(eq(reports.id, c.req.param('id')), eq(reports.status, 'open')))
      .returning({ id: reports.id })
    if (updated.length === 0) return c.json({ error: 'not_found' }, 404)
    return c.json({ ok: true })
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

  // Remove a dish post (soft-delete), mirroring the vibe-note path — sets
  // removedAt so it vanishes from every dish read (feed + restaurant rail),
  // keeps the row for audit, and marks matching open reports actioned.
  .delete('/dishes/:id', requireModerator, async (c) => {
    const id = c.req.param('id')
    await db.transaction(async (tx) => {
      await tx
        .update(dishes)
        .set({ removedAt: new Date() })
        .where(and(eq(dishes.id, id), isNull(dishes.removedAt)))
      await tx
        .update(reports)
        .set({ status: 'actioned' })
        .where(
          and(eq(reports.targetType, 'dish'), eq(reports.targetId, id), eq(reports.status, 'open')),
        )
    })
    return c.json({ ok: true })
  })

  // Eject (ban) a user. The ban gate in requireAuth then rejects them
  // everywhere; their content is filtered from reads.
  .post('/users/:userId/eject', requireModerator, async (c) => {
    const me = c.get('user')
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
