import { db, schema } from '@mesa/db'
import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import type { AuthedEnv } from '../context'
import { requireAuth } from '../middleware/session'

// Push token registration + the 4 category switches on app/notificaciones.tsx
// (M17). See packages/db/src/schema/notifications.ts's own header for why a
// missing prefs row means "everything on."

const { pushTokens, notificationPrefs } = schema

const tokenSchema = z.object({ token: z.string().trim().min(1).max(512) })
const prefsSchema = z
  .object({
    social: z.boolean().optional(),
    plans: z.boolean().optional(),
    friends: z.boolean().optional(),
    dishes: z.boolean().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'at least one field required' })

const DEFAULT_PREFS = { social: true, plans: true, friends: true, dishes: true }

export const notificationsRoutes = new Hono<AuthedEnv>()
  .use(requireAuth)

  // Register (or re-register) this device's Expo push token. A token
  // handed off to another account (device sold, app reinstalled under a
  // different sign-in) just moves — onConflictDoUpdate reassigns userId
  // rather than erroring, since `token` is the PK and there's exactly one
  // legitimate owner of a given device's token at a time.
  .post('/token', async (c) => {
    const me = c.get('user')
    const parsed = tokenSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400)

    await db
      .insert(pushTokens)
      .values({ token: parsed.data.token, userId: me.id })
      .onConflictDoUpdate({
        target: pushTokens.token,
        set: { userId: me.id },
      })
    return c.json({ ok: true })
  })

  // Sign-out and account deletion both call this — a device that's signed
  // out shouldn't keep receiving another session's pushes.
  .delete('/token', async (c) => {
    const me = c.get('user')
    const parsed = tokenSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400)

    await db
      .delete(pushTokens)
      .where(and(eq(pushTokens.token, parsed.data.token), eq(pushTokens.userId, me.id)))
    return c.json({ ok: true })
  })

  .get('/prefs', async (c) => {
    const me = c.get('user')
    const row = await db.query.notificationPrefs.findFirst({
      where: eq(notificationPrefs.userId, me.id),
      columns: { social: true, plans: true, friends: true, dishes: true },
    })
    return c.json(row ?? DEFAULT_PREFS)
  })

  .patch('/prefs', async (c) => {
    const me = c.get('user')
    const parsed = prefsSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400)

    const [row] = await db
      .insert(notificationPrefs)
      .values({ userId: me.id, ...DEFAULT_PREFS, ...parsed.data })
      .onConflictDoUpdate({
        target: notificationPrefs.userId,
        set: { ...parsed.data, updatedAt: new Date() },
      })
      .returning({
        social: notificationPrefs.social,
        plans: notificationPrefs.plans,
        friends: notificationPrefs.friends,
        dishes: notificationPrefs.dishes,
      })
    return c.json(row ?? DEFAULT_PREFS)
  })
