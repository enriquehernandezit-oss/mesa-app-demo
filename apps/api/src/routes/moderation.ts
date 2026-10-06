import { db, schema } from '@mesa/db'
import { and, desc, eq, gt, inArray, isNull, lt, or, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'

import { sendMail } from '../auth'
import type { AuthedEnv } from '../context'
import { alertModerators } from '../lib/moderatorAlert'
import { background } from '../lib/notify'
import { requireAuth, requireModerator } from '../middleware/session'

// UGC moderation (App Store 1.2). Every user can report content and block
// abusive accounts; moderators can remove content and eject users. A block hides
// content both ways; a removed note and a banned user disappear from all reads.
const {
  reports,
  userBlocks,
  vibeNotes,
  dishes,
  rankingComments,
  follows,
  followRequests,
  user,
  plans,
  restaurants,
} = schema

const uuid = z.string().uuid()
// Reports one member may file in a day — a flood from one account must not bury the real ones.
const REPORTS_PER_DAY = 30

const reportSchema = z
  .object({
    // Dishes are first-class UGC (photo + name + caption), so they must be
    // reportable like vibe notes and users (App Store 1.2). The enum already
    // carries 'dish' (reportTargetType in schema.ts). Ranking comments likewise
    // ('comment').
    targetType: z.enum(['vibe_note', 'user', 'dish', 'comment', 'plan', 'place']),
    targetId: z.string().min(1).max(64),
    reason: z.string().trim().min(1).max(500),
  })
  // Everything but a user is keyed by a uuid; a malformed id would otherwise fail the moderator
  // queue's uuid cast for everyone.
  .refine((b) => b.targetType === 'user' || uuid.safeParse(b.targetId).success, {
    message: 'targetId must be a uuid',
    path: ['targetId'],
  })
const blockSchema = z.object({ userId: z.string().min(1) })

// Reports per page of the moderator queue.
const QUEUE_PAGE = 50

// `<iso time>_<report id>` — a UUID never contains '_', so the last one splits them.
function parseQueueCursor(raw: string): { at: Date; id: string } | null {
  const i = raw.lastIndexOf('_')
  if (i === -1) return null
  const at = new Date(raw.slice(0, i))
  const id = raw.slice(i + 1)
  if (Number.isNaN(at.getTime()) || !uuid.safeParse(id).success) return null
  return { at, id }
}

export const moderationRoutes = new Hono<AuthedEnv>()
  .use(requireAuth)

  // --- Any user ---

  // Report a vibe note or a user. Filed for review; no state change to the
  // target here (that's a moderator action).
  .post('/reports', async (c) => {
    const me = c.get('user')
    const parsed = reportSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400)
    const { targetType, targetId } = parsed.data
    // The target must exist — a client bug (or a hand-made request) filing garbage ids would
    // otherwise sit in the queue forever. Nobody reports themselves.
    const found =
      targetType === 'plan'
        ? // A plan's note is the host's own words; the host does not report their own plan.
          await db.query.plans.findFirst({
            where: and(eq(plans.id, targetId), sql`${plans.hostId} <> ${me.id}`),
            columns: { id: true },
          })
        : targetType === 'place'
          ? await db.query.restaurants.findFirst({
              where: and(eq(restaurants.id, targetId), isNull(restaurants.removedAt)),
              columns: { id: true },
            })
          : targetType === 'comment'
            ? await db.query.rankingComments.findFirst({
                where: eq(rankingComments.id, targetId),
                columns: { id: true },
              })
            : targetType === 'vibe_note'
              ? await db.query.vibeNotes.findFirst({
                  where: eq(vibeNotes.id, targetId),
                  columns: { id: true },
                })
              : targetType === 'dish'
                ? await db.query.dishes.findFirst({
                    where: eq(dishes.id, targetId),
                    columns: { id: true },
                  })
                : targetId === me.id
                  ? undefined
                  : await db.query.user.findFirst({
                      where: eq(user.id, targetId),
                      columns: { id: true },
                    })
    if (!found) return c.json({ error: 'not_found' }, 404)

    // Reporting the same thing twice is one report, not two: the second tap is a no-op.
    const already = await db.query.reports.findFirst({
      where: and(
        eq(reports.reporterId, me.id),
        eq(reports.targetType, targetType),
        eq(reports.targetId, targetId),
        eq(reports.status, 'open'),
      ),
      columns: { id: true },
    })
    if (already) return c.json({ ok: true })

    const [{ n = 0 } = {}] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(reports)
      .where(
        and(
          eq(reports.reporterId, me.id),
          gt(reports.createdAt, new Date(Date.now() - 24 * 3600_000)),
        ),
      )
    if (n >= REPORTS_PER_DAY) return c.json({ error: 'rate_limited' }, 429)

    const [filed] = await db
      .insert(reports)
      .values({
        reporterId: me.id,
        targetType: parsed.data.targetType,
        targetId: parsed.data.targetId,
        reason: parsed.data.reason,
      })
      .returning({ id: reports.id })
    // Tell the moderators (an email; lib/moderatorAlert.ts says when it stays quiet). After the
    // answer, never part of it: a mail outage must not turn a filed report into an error.
    if (filed) {
      background(
        () =>
          alertModerators(
            { id: filed.id, targetType: parsed.data.targetType, reason: parsed.data.reason },
            sendMail,
          ),
        'moderator alert failed',
      )
    }
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
    // An id that is not a member used to hit the foreign key and answer 500.
    const target = await db.query.user.findFirst({
      where: eq(user.id, userId),
      columns: { id: true },
    })
    if (!target) return c.json({ error: 'not_found' }, 404)

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
      // A pending follow request either way goes too (F1) — a block leaves nothing to approve.
      await tx
        .delete(followRequests)
        .where(
          or(
            and(eq(followRequests.requesterId, me.id), eq(followRequests.targetId, userId)),
            and(eq(followRequests.requesterId, userId), eq(followRequests.targetId, me.id)),
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
  // 3f2a… / spam" without seeing the sentence. Batched by type (five queries
  // total, whatever the report count) rather than looked up per row.
  //
  // Newest first, a page at a time: `?cursor=` is the `nextCursor` of the page before (the first page
  // has none), and `total` is every open report, not just this page's. An older app sends no cursor
  // and reads the first page, which is what it always did.
  .get('/reports', requireModerator, async (c) => {
    const cursorRaw = c.req.query('cursor')
    const cursor = cursorRaw ? parseQueueCursor(cursorRaw) : null
    if (cursorRaw && !cursor) return c.json({ error: 'invalid_cursor' }, 400)

    const pageSize = Math.min(QUEUE_PAGE, Math.max(1, Number(c.req.query('limit')) || QUEUE_PAGE))
    const createdMs = sql`date_trunc('milliseconds', ${reports.createdAt})`
    const at = cursor ? sql`${cursor.at.toISOString()}::timestamp` : null
    const [page, [counted]] = await Promise.all([
      db
        .select()
        .from(reports)
        .where(
          and(
            eq(reports.status, 'open'),
            cursor && at
              ? or(lt(createdMs, at), and(sql`${createdMs} = ${at}`, lt(reports.id, cursor.id)))
              : undefined,
          ),
        )
        .orderBy(desc(createdMs), desc(reports.id))
        .limit(pageSize + 1),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(reports)
        .where(eq(reports.status, 'open')),
    ])
    const hasMore = page.length > pageSize
    const rows = hasMore ? page.slice(0, pageSize) : page
    const last = rows[rows.length - 1]
    const nextCursor = hasMore && last ? `${last.createdAt.toISOString()}_${last.id}` : null
    const total = counted?.n ?? 0
    if (rows.length === 0) return c.json({ reports: [], nextCursor: null, total })

    const idsOf = (t: (typeof rows)[number]['targetType']) =>
      rows.filter((r) => r.targetType === t).map((r) => r.targetId)
    // Filtered as well as validated at report time: a malformed row (older than that check) must
    // not fail the whole queue's uuid cast.
    const isUuid = (id: string) => uuid.safeParse(id).success
    const noteIds = idsOf('vibe_note').filter(isUuid)
    const dishIds = idsOf('dish').filter(isUuid)
    const userIds = idsOf('user')
    // Comment ids are validated as uuids at report time, but filter anyway so
    // one malformed legacy row can't fail the whole queue's uuid cast.
    const commentIds = idsOf('comment').filter(isUuid)
    const planIds = idsOf('plan').filter(isUuid)
    const placeIds = idsOf('place').filter(isUuid)

    const [notes, dishRows, users, commentRows, planRows, placeRows] = await Promise.all([
      noteIds.length
        ? db
            .select({
              id: vibeNotes.id,
              body: vibeNotes.body,
              userId: vibeNotes.userId,
              removedAt: vibeNotes.removedAt,
            })
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
      commentIds.length
        ? db
            .select({
              id: rankingComments.id,
              body: rankingComments.body,
              userId: rankingComments.userId,
              rankingId: rankingComments.rankingId,
              removedAt: rankingComments.removedAt,
            })
            .from(rankingComments)
            .where(inArray(rankingComments.id, commentIds))
        : [],
      planIds.length
        ? db
            .select({ id: plans.id, note: plans.note, hostId: plans.hostId })
            .from(plans)
            .where(inArray(plans.id, planIds))
        : [],
      placeIds.length
        ? db
            .select({
              id: restaurants.id,
              name: restaurants.name,
              source: restaurants.source,
              removedAt: restaurants.removedAt,
            })
            .from(restaurants)
            .where(inArray(restaurants.id, placeIds))
        : [],
    ])

    const noteById = new Map(notes.map((n) => [n.id, n]))
    const dishById = new Map(dishRows.map((d) => [d.id, d]))
    const userById = new Map(users.map((u) => [u.id, u]))
    const commentById = new Map(commentRows.map((cm) => [cm.id, cm]))
    const planById = new Map(planRows.map((p) => [p.id, p]))
    const placeById = new Map(placeRows.map((p) => [p.id, p]))

    // `target` is null when the row is already gone (deleted account, hard
    // delete) — the queue still shows the report so it can be dismissed.
    // `alreadyHandled` lets the UI grey out a report whose content another
    // moderator (or the author) already removed.
    const enriched = rows.map((r) => {
      if (r.targetType === 'vibe_note') {
        const n = noteById.get(r.targetId)
        return {
          ...r,
          // userId: so the queue can link to the note's author — a moderator
          // deciding whether to remove content previously had no way to see
          // who else that person is (their other rankings, whether they've
          // been reported before) without leaving the queue.
          target: n ? { kind: 'vibe_note' as const, body: n.body, userId: n.userId } : null,
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
      if (r.targetType === 'comment') {
        const cm = commentById.get(r.targetId)
        return {
          ...r,
          target: cm
            ? {
                kind: 'comment' as const,
                body: cm.body,
                userId: cm.userId,
                rankingId: cm.rankingId,
              }
            : null,
          alreadyHandled: cm ? cm.removedAt !== null : true,
        }
      }
      if (r.targetType === 'plan') {
        const p = planById.get(r.targetId)
        return {
          ...r,
          target: p ? { kind: 'plan' as const, note: p.note, hostId: p.hostId } : null,
          // A plan with no note left has nothing more to remove.
          alreadyHandled: p ? p.note === null : true,
        }
      }
      if (r.targetType === 'place') {
        const p = placeById.get(r.targetId)
        return {
          ...r,
          target: p ? { kind: 'place' as const, name: p.name, source: p.source } : null,
          alreadyHandled: p ? p.removedAt !== null : true,
        }
      }
      const u = userById.get(r.targetId)
      return {
        ...r,
        target: u ? { kind: 'user' as const, name: u.name, handle: u.handle } : null,
        alreadyHandled: u ? u.bannedAt !== null : true,
      }
    })
    return c.json({ reports: enriched, nextCursor, total })
  })

  // Close a report without acting on it — the "reviewed, nothing wrong here"
  // path. Without it the queue only ever grows: every other moderator action
  // marks reports 'actioned', but an unfounded report would stay open forever.
  .post('/reports/:id/dismiss', requireModerator, async (c) => {
    if (!uuid.safeParse(c.req.param('id')).success) return c.json({ error: 'not_found' }, 404)
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
    if (!uuid.safeParse(id).success) return c.json({ error: 'not_found' }, 404)
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
    if (!uuid.safeParse(id).success) return c.json({ error: 'not_found' }, 404)
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

  // Remove a ranking comment (soft-delete), mirroring the vibe-note path — it
  // drops out of the thread and the feed's count/latest line, the row stays for
  // audit, and matching open reports are marked actioned.
  .delete('/comments/:id', requireModerator, async (c) => {
    const id = c.req.param('id')
    if (!uuid.safeParse(id).success) return c.json({ error: 'not_found' }, 404)
    await db.transaction(async (tx) => {
      await tx
        .update(rankingComments)
        .set({ removedAt: new Date() })
        .where(and(eq(rankingComments.id, id), isNull(rankingComments.removedAt)))
      await tx
        .update(reports)
        .set({ status: 'actioned' })
        .where(
          and(
            eq(reports.targetType, 'comment'),
            eq(reports.targetId, id),
            eq(reports.status, 'open'),
          ),
        )
    })
    return c.json({ ok: true })
  })

  // Clear a plan's note — the moderator action for a reported plan. The plan itself stays (people made
  // arrangements around it); only the words are removed. Open reports on it are marked actioned.
  .post('/plans/:id/clear-note', requireModerator, async (c) => {
    const id = c.req.param('id')
    if (!uuid.safeParse(id).success) return c.json({ error: 'not_found' }, 404)
    await db.transaction(async (tx) => {
      await tx.update(plans).set({ note: null }).where(eq(plans.id, id))
      await tx
        .update(reports)
        .set({ status: 'actioned' })
        .where(
          and(eq(reports.targetType, 'plan'), eq(reports.targetId, id), eq(reports.status, 'open')),
        )
    })
    return c.json({ ok: true })
  })

  // Remove a place from Mesa (soft: `removed_at`, the flag every read already honours — the page 404s,
  // search and lists skip it). The row, its rankings and its history stay for audit, so a mistaken
  // removal is one UPDATE to undo. Until now this took a script run against production.
  .delete('/places/:id', requireModerator, async (c) => {
    const id = c.req.param('id')
    if (!uuid.safeParse(id).success) return c.json({ error: 'not_found' }, 404)
    await db.transaction(async (tx) => {
      await tx
        .update(restaurants)
        .set({ removedAt: new Date() })
        .where(and(eq(restaurants.id, id), isNull(restaurants.removedAt)))
      await tx
        .update(reports)
        .set({ status: 'actioned' })
        .where(
          and(
            eq(reports.targetType, 'place'),
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
