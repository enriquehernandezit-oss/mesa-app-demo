import { db, schema } from '@mesa/db'
import { and, asc, eq, inArray, isNull, notInArray, or } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'

import type { AuthedEnv } from '../context'
import { parseCommentBody } from '../lib/commentBody'
import { sendPush } from '../lib/push'
import { blockedByMe, blockedMe, visibleComment } from '../lib/visibility'
import { requireAuth } from '../middleware/session'

// Comments on a friend's ranking — the conversation half of the feed, next to
// cheers' one-tap reaction. A thread is flat and oldest-first; the feed carries
// the count and the latest line. Same block/ban visibility as everything else.
const { rankings, rankingComments, restaurants, user, vibeNotes } = schema

const uuid = z.string().uuid()

// The ranking a thread hangs off, or undefined when it doesn't exist, its owner
// is banned, or a block stands between us either way — all three read as 404,
// so a blocked user can't probe for the ranking. One round trip; the note join
// mirrors the feed's (the vibe note lives in its own table, keyed by
// user + restaurant).
async function visibleRanking(meId: string, rankingId: string) {
  const [row] = await db
    .select({
      id: rankings.id,
      score: rankings.score,
      note: vibeNotes.body,
      user: { id: user.id, name: user.name, handle: user.handle, image: user.image },
      restaurant: { id: restaurants.id, name: restaurants.name },
    })
    .from(rankings)
    .innerJoin(user, eq(user.id, rankings.userId))
    .innerJoin(restaurants, eq(restaurants.id, rankings.restaurantId))
    .leftJoin(
      vibeNotes,
      and(
        eq(vibeNotes.userId, rankings.userId),
        eq(vibeNotes.restaurantId, rankings.restaurantId),
        isNull(vibeNotes.removedAt),
      ),
    )
    .where(
      and(
        eq(rankings.id, rankingId),
        isNull(user.bannedAt),
        notInArray(rankings.userId, blockedByMe(meId)),
        notInArray(rankings.userId, blockedMe(meId)),
      ),
    )
  return row
}

export const commentsRoutes = new Hono<AuthedEnv>()
  .use(requireAuth)

  // The thread: the ranking header plus every visible comment, oldest first.
  // Two queries whatever the thread length. canDelete: the author can delete
  // their own comment, and the ranking's owner can clear any comment on it.
  .get('/ranking/:rankingId', async (c) => {
    const me = c.get('user')
    const rankingId = c.req.param('rankingId')
    // A malformed id would otherwise reach Postgres as an invalid uuid cast.
    if (!uuid.safeParse(rankingId).success) return c.json({ error: 'not_found' }, 404)
    const ranking = await visibleRanking(me.id, rankingId)
    if (!ranking) return c.json({ error: 'not_found' }, 404)

    const rows = await db
      .select({
        id: rankingComments.id,
        body: rankingComments.body,
        createdAt: rankingComments.createdAt,
        user: { id: user.id, name: user.name, handle: user.handle, image: user.image },
      })
      .from(rankingComments)
      .innerJoin(user, eq(user.id, rankingComments.userId))
      .where(and(eq(rankingComments.rankingId, rankingId), visibleComment(me.id)))
      .orderBy(asc(rankingComments.createdAt), asc(rankingComments.id))

    const ownsRanking = ranking.user.id === me.id
    return c.json({
      ranking,
      comments: rows.map((r) => ({ ...r, canDelete: ownsRanking || r.user.id === me.id })),
    })
  })

  .post('/ranking/:rankingId', async (c) => {
    const me = c.get('user')
    const rankingId = c.req.param('rankingId')
    const body = parseCommentBody(await c.req.json().catch(() => null))
    if (!body) return c.json({ error: 'invalid_body' }, 400)
    if (!uuid.safeParse(rankingId).success) return c.json({ error: 'not_found' }, 404)
    const ranking = await visibleRanking(me.id, rankingId)
    if (!ranking) return c.json({ error: 'not_found' }, 404)

    const [row] = await db
      .insert(rankingComments)
      .values({ rankingId, userId: me.id, body })
      .returning({
        id: rankingComments.id,
        body: rankingComments.body,
        createdAt: rankingComments.createdAt,
      })
    if (!row) throw new Error('comment insert returned no row')

    if (ranking.user.id !== me.id) {
      // Keyed per comment (not hour-bucketed like cheers): each comment is its
      // own message worth reading, not a repeatable tap.
      sendPush([
        {
          userId: ranking.user.id,
          key: `comment:${row.id}`,
          category: 'social',
          title: 'Mesa',
          body: `${me.name || 'Alguien'} comentó tu ranking de ${ranking.restaurant.name}`,
          data: { type: 'restaurant', restaurantId: ranking.restaurant.id },
        },
      ])
    }

    return c.json({
      comment: {
        ...row,
        user: { id: me.id, name: me.name, handle: me.handle ?? null, image: me.image ?? null },
        canDelete: true,
      },
    })
  })

  // Hard delete, by the comment's author or the ranking's owner. One statement:
  // the permission check rides in the WHERE, so a comment that isn't mine to
  // delete and one that doesn't exist both come back 404 (no existence probe).
  .delete('/:commentId', async (c) => {
    const me = c.get('user')
    const commentId = c.req.param('commentId')
    if (!uuid.safeParse(commentId).success) return c.json({ error: 'not_found' }, 404)
    const deleted = await db
      .delete(rankingComments)
      .where(
        and(
          eq(rankingComments.id, commentId),
          or(
            eq(rankingComments.userId, me.id),
            inArray(
              rankingComments.rankingId,
              db.select({ id: rankings.id }).from(rankings).where(eq(rankings.userId, me.id)),
            ),
          ),
        ),
      )
      .returning({ id: rankingComments.id })
    if (deleted.length === 0) return c.json({ error: 'not_found' }, 404)
    return c.json({ ok: true })
  })
