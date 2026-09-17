import { db, schema } from '@mesa/db'
import { inArray } from 'drizzle-orm'

// Push notifications over Expo's push service (M17). Unset EXPO_ACCESS_TOKEN
// -> every send is a no-op (same "dark, not broken" convention as
// GOOGLE_PLACES_API_KEY): dev and any environment without the founder's
// token still boot and serve normally, they just never call out.
const EXPO_ACCESS_TOKEN = process.env.EXPO_ACCESS_TOKEN
const SEND_URL = 'https://exp.host/--/api/v2/push/send'
const RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts'
// Expo's own hard cap is 100 messages/request for /send (and 1000 ids for
// /getReceipts, though sendPush's own queue never gets that deep between two
// 10-minute sweeps in practice).
const BATCH_SIZE = 100

const { pushTokens, notificationPrefs, pushLog } = schema

export type PushCategory = 'social' | 'plans' | 'friends' | 'dishes'

export interface PushMessage {
  userId: string
  // push_log's dedupe key for this (userId, key) pair — see notifications.ts's
  // own header. Unique per real-world event; the cheers trigger folds an
  // hour bucket into it for the "≤1 per ranking per hour" throttle.
  key: string
  category: PushCategory
  title: string
  body: string
  // Deep-link data the mobile app's notification-tap handler reads.
  data?: Record<string, string>
}

// Claims one push_log row. Returns false if it's already claimed — either a
// duplicate event, or (for the cheers throttle) the same hour bucket as an
// earlier cheer on the same ranking.
async function claim(userId: string, key: string): Promise<boolean> {
  const inserted = await db
    .insert(pushLog)
    .values({ userId, key })
    .onConflictDoNothing()
    .returning({ userId: pushLog.userId })
  return inserted.length > 0
}

// A missing notification_prefs row means "never touched the screen" — every
// category defaults true (see notifications.ts). Only users who exist in the
// table can have anything turned off.
async function enabledUserIds(userIds: string[], category: PushCategory): Promise<Set<string>> {
  if (userIds.length === 0) return new Set()
  const rows = await db
    .select({
      userId: notificationPrefs.userId,
      social: notificationPrefs.social,
      plans: notificationPrefs.plans,
      friends: notificationPrefs.friends,
      dishes: notificationPrefs.dishes,
    })
    .from(notificationPrefs)
    .where(inArray(notificationPrefs.userId, userIds))
  const disabled = new Set(rows.filter((r) => !r[category]).map((r) => r.userId))
  return new Set(userIds.filter((id) => !disabled.has(id)))
}

interface ExpoTicket {
  status: 'ok' | 'error'
  id?: string
  message?: string
  details?: { error?: string }
}

// Tickets awaiting a receipt check, and which token each belongs to (so a
// receipt that comes back DeviceNotRegistered knows which row to delete).
// In-process only — this API is a single small instance (see index.ts's
// Sentry comment), so there's no second instance to lose track of a ticket,
// and a ticket dropped by a mid-sweep restart just never gets its dead token
// cleaned up a little early; the next real send from that token produces a
// fresh ticket and tries again.
const pendingTickets: { ticketId: string; token: string }[] = []

async function deleteTokens(tokens: string[]): Promise<void> {
  if (tokens.length === 0) return
  await db.delete(pushTokens).where(inArray(pushTokens.token, tokens))
}

// Sends one batch of ≤100 messages' worth of tokens through Expo's push API.
// `entries` have already been claimed and pref-checked by sendPush below.
async function sendBatch(
  entries: { token: string; title: string; body: string; data?: Record<string, string> }[],
): Promise<void> {
  const res = await fetch(SEND_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
      Authorization: `Bearer ${EXPO_ACCESS_TOKEN}`,
    },
    body: JSON.stringify(
      entries.map((e) => ({
        to: e.token,
        title: e.title,
        body: e.body,
        data: e.data,
        sound: 'default',
      })),
    ),
  })
  if (!res.ok) {
    console.error('expo push send failed', res.status, await res.text().catch(() => ''))
    return
  }
  const json = (await res.json().catch(() => null)) as { data?: ExpoTicket[] } | null
  const tickets = json?.data ?? []
  const deadTokens: string[] = []
  tickets.forEach((ticket, i) => {
    const token = entries[i]?.token
    if (!token) return
    // Some errors are known immediately at send time — no need to wait for a
    // receipt to clean these up.
    if (ticket.status === 'error') {
      if (ticket.details?.error === 'DeviceNotRegistered') deadTokens.push(token)
      else console.error('expo push ticket error', ticket.message, token)
      return
    }
    if (ticket.id) pendingTickets.push({ ticketId: ticket.id, token })
  })
  await deleteTokens(deadTokens)
}

// The write path calls this WITHOUT await — see sendPush's own comment. Runs
// entirely after the caller's response has already gone out.
async function sendPushInner(messages: PushMessage[]): Promise<void> {
  if (!EXPO_ACCESS_TOKEN || messages.length === 0) return

  // Prefs first: a category a user has switched off never even claims a
  // push_log slot, so re-enabling it later doesn't skip a push that was
  // silently throttled away while it was off.
  const byCategory = new Map<PushCategory, PushMessage[]>()
  for (const m of messages) {
    const list = byCategory.get(m.category) ?? []
    list.push(m)
    byCategory.set(m.category, list)
  }
  const afterPrefs: PushMessage[] = []
  for (const [category, list] of byCategory) {
    const ok = await enabledUserIds([...new Set(list.map((m) => m.userId))], category)
    afterPrefs.push(...list.filter((m) => ok.has(m.userId)))
  }
  if (afterPrefs.length === 0) return

  const claimed: PushMessage[] = []
  for (const m of afterPrefs) {
    if (await claim(m.userId, m.key)) claimed.push(m)
  }
  if (claimed.length === 0) return

  const userIds = [...new Set(claimed.map((m) => m.userId))]
  const tokenRows = await db
    .select({ token: pushTokens.token, userId: pushTokens.userId })
    .from(pushTokens)
    .where(inArray(pushTokens.userId, userIds))
  const tokensByUser = new Map<string, string[]>()
  for (const row of tokenRows) {
    const list = tokensByUser.get(row.userId) ?? []
    list.push(row.token)
    tokensByUser.set(row.userId, list)
  }

  const entries = claimed.flatMap((m) =>
    (tokensByUser.get(m.userId) ?? []).map((token) => ({
      token,
      title: m.title,
      body: m.body,
      data: m.data,
    })),
  )
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    await sendBatch(entries.slice(i, i + BATCH_SIZE))
  }
}

// Fire-and-forget by convention: every trigger site calls `void
// sendPush(...)`, never `await sendPush(...)` — a push failure or a slow
// Expo round trip must never slow down or fail the write it's attached to.
// Errors are swallowed here (not re-thrown) since nothing downstream awaits
// this to observe them.
export function sendPush(messages: PushMessage[]): void {
  sendPushInner(messages).catch((err) => console.error('sendPush failed', err))
}

// lib/pushSweep.ts calls this every 10 minutes. Drains whatever tickets are
// pending, asks Expo which ones failed, and deletes the dead tokens — the
// other half of dead-token cleanup: errors Expo can only tell you about
// after delivery was actually attempted (app uninstalled, permission
// revoked at the OS level), not at send time.
export async function checkReceipts(): Promise<void> {
  if (!EXPO_ACCESS_TOKEN || pendingTickets.length === 0) return
  const batch = pendingTickets.splice(0, 1000)
  const res = await fetch(RECEIPTS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${EXPO_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({ ids: batch.map((t) => t.ticketId) }),
  })
  if (!res.ok) {
    console.error('expo push receipts failed', res.status, await res.text().catch(() => ''))
    return
  }
  const json = (await res.json().catch(() => null)) as {
    data?: Record<string, ExpoTicket>
  } | null
  const receipts = json?.data ?? {}
  const deadTokens = batch
    .filter((t) => receipts[t.ticketId]?.details?.error === 'DeviceNotRegistered')
    .map((t) => t.token)
  await deleteTokens(deadTokens)
}
