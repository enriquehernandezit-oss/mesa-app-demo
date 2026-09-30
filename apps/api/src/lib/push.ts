import { db, schema } from '@mesa/db'
import { and, eq, inArray, isNull } from 'drizzle-orm'

import type { Locale } from './notifyCopy'

// Push notifications over Expo's push service (M17) — the TRANSPORT. What to say and who to
// tell lives in lib/notify.ts (inbox rows become pushes) and lib/pushSweep.ts (event
// reminders); this file takes finished messages and gets them to phones: category
// switches, throttle claims, tokens, Expo's send + receipt APIs. Unset EXPO_ACCESS_TOKEN ->
// every send is a no-op (same "dark, not broken" convention as GOOGLE_PLACES_API_KEY): dev
// and any environment without the founder's token still boot and serve normally, they just
// never call out.
const EXPO_ACCESS_TOKEN = process.env.EXPO_ACCESS_TOKEN
const SEND_URL = 'https://exp.host/--/api/v2/push/send'
const RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts'
// Expo's own hard cap is 100 messages/request for /send (and 1000 ids for
// /getReceipts, though the ticket queue never gets that deep between two sweeps in
// practice).
const BATCH_SIZE = 100

const { pushTokens, notificationPrefs, pushLog, user } = schema

export type PushCategory = 'social' | 'plans' | 'friends' | 'dishes' | 'events'

export interface PushMessage {
  userId: string
  // push_log's throttle/dedupe key for this (userId, key) pair: at most one push per pair
  // ever sent. Unique per real-world event for a one-time push (a reminder offset), or
  // with a time bucket folded in for a throttle (cheers' "≤1 per ranking per hour"). Omit
  // it when the message needs none — inbox rows dedupe themselves through notifications'
  // own unique key.
  key?: string
  category: PushCategory
  data?: Record<string, string>
  // The words, chosen once the recipient's language is known (users.locale).
  copy: (locale: Locale) => { title: string; body: string }
}

// One phone's message, ready for Expo.
export interface PushEntry {
  token: string
  title: string
  body: string
  data?: Record<string, string>
}

const pairKey = (userId: string, key: string) => `${userId}\u0000${key}`

// Claims push_log rows in one statement and returns which (userId, key) pairs were free.
// A pair that's already claimed is either a duplicate event or (for a throttle) the same
// window as an earlier push.
export async function claimMany(pairs: { userId: string; key: string }[]): Promise<Set<string>> {
  if (pairs.length === 0) return new Set()
  const claimed = await db
    .insert(pushLog)
    .values(pairs)
    .onConflictDoNothing()
    .returning({ userId: pushLog.userId, key: pushLog.key })
  return new Set(claimed.map((c) => pairKey(c.userId, c.key)))
}

// From messages to per-phone entries, in a fixed number of queries however many people:
//   1. prefs — a category a member switched off never even claims a push_log slot, so
//      re-enabling it later doesn't skip a push that was silently throttled while it was off
//      (a missing notification_prefs row means "never touched the screen": everything on);
//   2. tokens, with each owner's language — banned members are never pushed;
//   3. throttle claims for the messages that carry a key.
// Exported for the DB test: it is everything that decides who is pushed, minus the call out.
export async function buildEntries(messages: PushMessage[]): Promise<PushEntry[]> {
  if (messages.length === 0) return []

  const prefRows = await db
    .select({
      userId: notificationPrefs.userId,
      social: notificationPrefs.social,
      plans: notificationPrefs.plans,
      friends: notificationPrefs.friends,
      dishes: notificationPrefs.dishes,
      events: notificationPrefs.events,
    })
    .from(notificationPrefs)
    .where(inArray(notificationPrefs.userId, [...new Set(messages.map((m) => m.userId))]))
  const prefs = new Map(prefRows.map((r) => [r.userId, r]))
  const wanted = messages.filter((m) => prefs.get(m.userId)?.[m.category] ?? true)
  if (wanted.length === 0) return []

  const tokenRows = await db
    .select({ token: pushTokens.token, userId: pushTokens.userId, locale: user.locale })
    .from(pushTokens)
    .innerJoin(user, eq(user.id, pushTokens.userId))
    .where(
      and(
        inArray(pushTokens.userId, [...new Set(wanted.map((m) => m.userId))]),
        isNull(user.bannedAt),
      ),
    )
  const phones = new Map<string, { locale: Locale; tokens: string[] }>()
  for (const row of tokenRows) {
    const phone = phones.get(row.userId) ?? { locale: row.locale, tokens: [] }
    phone.tokens.push(row.token)
    phones.set(row.userId, phone)
  }
  const reachable = wanted.filter((m) => phones.has(m.userId))

  const free = await claimMany(
    reachable.flatMap((m) => (m.key ? [{ userId: m.userId, key: m.key }] : [])),
  )
  // Two messages can carry the same pair inside one batch; only the first is sent.
  const sent = new Set<string>()
  const entries: PushEntry[] = []
  for (const m of reachable) {
    if (m.key) {
      const pair = pairKey(m.userId, m.key)
      if (!free.has(pair) || sent.has(pair)) continue
      sent.add(pair)
    }
    const phone = phones.get(m.userId)
    if (!phone) continue
    const { title, body } = m.copy(phone.locale)
    for (const token of phone.tokens) entries.push({ token, title, body, data: m.data })
  }
  return entries
}

interface ExpoTicket {
  status: 'ok' | 'error'
  id?: string
  message?: string
  details?: { error?: string }
}

// Tickets awaiting a receipt check, and which token each belongs to (so a
// receipt that comes back DeviceNotRegistered knows which row to delete).
// In-process only — this API is a single small instance, so there's no
// second instance to lose track of a ticket, and a ticket dropped by a
// mid-sweep restart just never gets its dead token cleaned up a little
// early; the next real send from that token produces a fresh ticket and
// tries again.
const pendingTickets: { ticketId: string; token: string }[] = []

async function deleteTokens(tokens: string[]): Promise<void> {
  if (tokens.length === 0) return
  await db.delete(pushTokens).where(inArray(pushTokens.token, tokens))
}

// Sends one batch of ≤100 messages' worth of tokens through Expo's push API.
async function sendBatch(entries: PushEntry[]): Promise<void> {
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

// Fire-and-forget by convention: every caller does `void sendPush(...)`, never `await` — a
// push failure or a slow Expo round trip must never slow down or fail the write it's
// attached to. Errors are swallowed here (not re-thrown) since nothing downstream awaits
// this to observe them.
export function sendPush(messages: PushMessage[]): void {
  deliver(messages).catch((err) => console.error('sendPush failed', err))
}

async function deliver(messages: PushMessage[]): Promise<void> {
  if (!EXPO_ACCESS_TOKEN || messages.length === 0) return
  const entries = await buildEntries(messages)
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    await sendBatch(entries.slice(i, i + BATCH_SIZE))
  }
}

// Whether this environment calls Expo at all — lib/notify.ts skips the name lookups when
// it can't.
export const pushEnabled = (): boolean => Boolean(EXPO_ACCESS_TOKEN)

// lib/pushSweep.ts calls this every sweep. Drains whatever tickets are
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
