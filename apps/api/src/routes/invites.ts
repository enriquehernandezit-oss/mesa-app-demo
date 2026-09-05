import { db, schema } from '@mesa/db'
import { eq, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import type { AuthedEnv } from '../context'
import { generateInviteCode } from '../lib/inviteCode'
import { requireAuth } from '../middleware/session'

// Invites — the growth loop's measurement, not a gate. Every member has one
// permanent code, it never runs out, and being invited unlocks nothing that
// isn't already free. See the schema comment in packages/db/src/schema/growth.ts
// for why Mesa refuses the scarcity model.
const { invites, inviteRedemptions } = schema

const redeemSchema = z.object({ code: z.string().trim().min(4).max(16) })

export const inviteRoutes = new Hono<AuthedEnv>()
  .use(requireAuth)

  // My invite link. Created lazily on first open so accounts that never share
  // don't carry a row. The unique index on user_id means a race can only ever
  // produce one code — the retry re-reads the winner rather than failing.
  .get('/me', async (c) => {
    const me = c.get('user')
    const existing = await db.query.invites.findFirst({
      where: eq(invites.userId, me.id),
      columns: { code: true },
    })
    if (existing) return c.json({ code: existing.code })

    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateInviteCode()
      const [row] = await db
        .insert(invites)
        .values({ code, userId: me.id })
        .onConflictDoNothing()
        .returning({ code: invites.code })
      if (row) return c.json({ code: row.code })
      // Conflict: either this code exists (retry with a new one) or this user
      // got a code from a concurrent request (return theirs).
      const mine = await db.query.invites.findFirst({
        where: eq(invites.userId, me.id),
        columns: { code: true },
      })
      if (mine) return c.json({ code: mine.code })
    }
    return c.json({ error: 'could_not_allocate' }, 500)
  })

  // How many people joined through my link — the number that makes k-factor
  // real. Shown on the invite row so sharing has visible feedback.
  .get('/me/stats', async (c) => {
    const me = c.get('user')
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(inviteRedemptions)
      .where(eq(inviteRedemptions.inviterId, me.id))
    return c.json({ joined: row?.count ?? 0 })
  })

  // Attribute the caller to a code. Called once, right after onboarding, with a
  // code the app captured from the universal link that opened it.
  //
  // Deliberately forgiving: an unknown or already-used attribution is not an
  // error the member should ever see — it returns ok:false and the app moves on.
  // Nothing about their account depends on this succeeding.
  .post('/redeem', async (c) => {
    const me = c.get('user')
    const parsed = redeemSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400)

    const invite = await db.query.invites.findFirst({
      where: eq(invites.code, parsed.data.code.toUpperCase()),
      columns: { code: true, userId: true },
    })
    if (!invite) return c.json({ ok: false, reason: 'unknown_code' })
    // Self-invites would inflate the loop with one account; the DB CHECK also
    // refuses, this just avoids the round trip and returns a clearer reason.
    if (invite.userId === me.id) return c.json({ ok: false, reason: 'own_code' })

    // The unique index on invited_user_id makes first-attribution-wins a
    // database guarantee rather than a race we hope to win.
    const [row] = await db
      .insert(inviteRedemptions)
      .values({ code: invite.code, inviterId: invite.userId, invitedUserId: me.id })
      .onConflictDoNothing()
      .returning({ invitedUserId: inviteRedemptions.invitedUserId })

    if (!row) return c.json({ ok: false, reason: 'already_attributed' })
    return c.json({ ok: true })
  })
