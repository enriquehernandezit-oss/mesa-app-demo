import type { schema } from '@mesa/db'

// Everything a push SAYS and OPENS, as pure functions (no database), so the words in both
// languages are unit-tested in notifyCopy.test.ts. lib/notify.ts loads the names these
// need; this file only turns a notification row + those names into text.

export type Locale = 'es' | 'en'
type Kind = schema.NotificationKind
export type NotificationRow = typeof schema.notifications.$inferSelect

// The names a message mentions, looked up from the row's foreign keys (null when the row
// doesn't point at one, or it has since been deleted).
export interface CopyCtx {
  actor: string | null
  place: string | null
  event: string | null
  dish: string | null
  data: schema.NotificationData | null
}

interface Words {
  name: string
  place: string
  event: string
  dish: string
  data: schema.NotificationData
}

const FALLBACK: Record<Locale, { name: string; place: string; event: string; dish: string }> = {
  es: { name: 'Alguien', place: 'un lugar', event: 'un evento', dish: 'plato' },
  en: { name: 'Someone', place: 'a place', event: 'an event', dish: 'dish' },
}

const BODY: Record<Kind, Record<Locale, (w: Words) => string>> = {
  follow: {
    es: (w) => `${w.name} te empezó a seguir`,
    en: (w) => `${w.name} started following you`,
  },
  follow_request: {
    es: (w) => `${w.name} quiere seguirte`,
    en: (w) => `${w.name} requested to follow you`,
  },
  follow_accepted: {
    es: (w) => `${w.name} aceptó tu solicitud`,
    en: (w) => `${w.name} accepted your follow request`,
  },
  cheers: {
    es: (w) => `${w.name} le dio cheers a tu ranking de ${w.place}`,
    en: (w) => `${w.name} cheered your ranking of ${w.place}`,
  },
  dish_cheer: {
    es: (w) => `${w.name} le dio like a tu ${w.dish}`,
    en: (w) => `${w.name} liked your ${w.dish}`,
  },
  comment: {
    es: (w) =>
      w.data.excerpt
        ? `${w.name} comentó: “${w.data.excerpt}”`
        : `${w.name} comentó tu ranking de ${w.place}`,
    en: (w) =>
      w.data.excerpt
        ? `${w.name} commented: “${w.data.excerpt}”`
        : `${w.name} commented on your ranking of ${w.place}`,
  },
  saved_ranked: {
    es: (w) => `${w.name} rankeó ${w.place}, que tienes guardado`,
    en: (w) => `${w.name} ranked ${w.place}, which you saved`,
  },
  plan_invite: {
    es: (w) => `${w.name} te invitó a un plan`,
    en: (w) => `${w.name} invited you to a plan`,
  },
  // One push per call, describing whichever changed — a reply wins over the vote that came
  // with it, since "can't make it" is the bigger news for the host.
  plan_reply: {
    es: (w) =>
      w.data.reply === 'going'
        ? `${w.name} va a tu plan`
        : w.data.reply === 'maybe'
          ? `${w.name} tal vez va a tu plan`
          : w.data.reply === 'declined'
            ? `${w.name} no puede ir a tu plan`
            : `${w.name} votó en tu plan`,
    en: (w) =>
      w.data.reply === 'going'
        ? `${w.name} is going to your plan`
        : w.data.reply === 'maybe'
          ? `${w.name} might come to your plan`
          : w.data.reply === 'declined'
            ? `${w.name} can't make your plan`
            : `${w.name} voted on your plan`,
  },
  event_going: {
    es: (w) => `${w.name} va a ${w.event}`,
    en: (w) => `${w.name} is going to ${w.event}`,
  },
  event_cancelled: {
    es: (w) => `${w.event} fue cancelado.`,
    en: (w) => `${w.event} was cancelled.`,
  },
  dish_nudge: {
    es: (w) =>
      `Has comido ${w.data.label ?? w.dish} en ${w.data.count ?? 3} lugares. ¿Cuál fue el mejor?`,
    en: (w) =>
      `You've had ${w.data.label ?? w.dish} at ${w.data.count ?? 3} places. Which was best?`,
  },
}

export function pushCopy(
  kind: Kind,
  locale: Locale,
  ctx: CopyCtx,
): { title: string; body: string } {
  const f = FALLBACK[locale]
  const words: Words = {
    name: ctx.actor?.trim() || f.name,
    place: ctx.place ?? f.place,
    event: ctx.event ?? f.event,
    dish: ctx.dish ?? f.dish,
    data: ctx.data ?? {},
  }
  return { title: 'Mesa', body: BODY[kind][locale](words) }
}

// The deep-link payload a tap on the push carries — the shapes apps/mobile's
// lib/pushLinks.ts already understands (it ignores anything else).
export function pushPayload(n: NotificationRow): Record<string, string> | undefined {
  switch (n.kind) {
    case 'follow':
    case 'follow_request':
    case 'follow_accepted':
      return n.actorId ? { type: 'user', userId: n.actorId } : undefined
    case 'cheers':
    case 'comment':
    case 'saved_ranked':
      return n.restaurantId ? { type: 'restaurant', restaurantId: n.restaurantId } : undefined
    case 'dish_cheer':
      return n.dishId ? { type: 'dish', dishId: n.dishId } : undefined
    case 'plan_invite':
    case 'plan_reply':
      return n.planId ? { type: 'plan', planId: n.planId } : undefined
    case 'event_going':
    case 'event_cancelled':
      return n.eventId ? { type: 'event', eventId: n.eventId } : undefined
    case 'dish_nudge':
      return n.dishListId ? { type: 'dish-list', listId: n.dishListId } : undefined
  }
}

// The reminder pushes for an event you're going to (lib/pushSweep.ts) — not inbox rows, so
// they are not a NotificationKind, but they are written in the member's language too.
export function reminderCopy(
  locale: Locale,
  title: string,
  offsetMs: number,
): { title: string; body: string } {
  const hours = Math.round(offsetMs / 3_600_000)
  const body =
    offsetMs === 0
      ? locale === 'es'
        ? `${title} empieza ahora.`
        : `${title} starts now.`
      : offsetMs === 24 * 3_600_000
        ? locale === 'es'
          ? `${title} es mañana.`
          : `${title} is tomorrow.`
        : locale === 'es'
          ? `${title} empieza en ${hours}h.`
          : `${title} starts in ${hours}h.`
  return { title: 'Mesa', body }
}

const EXCERPT_LENGTH = 80

// What a comment (or, later, a note) looks like inside a notification: whitespace
// collapsed to single spaces, cut at 80 characters with an ellipsis.
export function excerpt(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > EXCERPT_LENGTH ? `${flat.slice(0, EXCERPT_LENGTH - 1).trimEnd()}…` : flat
}
