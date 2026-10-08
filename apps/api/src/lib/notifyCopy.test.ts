import { describe, expect, test } from 'bun:test'

import type { schema } from '@mesa/db'

import { type NotificationRow, excerpt, pushCopy, pushPayload, reminderCopy } from './notifyCopy'

// Typed as a Record so adding a NotificationKind fails to compile here until the new kind's
// copy and payload are covered by the loops below.
const KINDS: Record<schema.NotificationKind, true> = {
  follow: true,
  follow_request: true,
  follow_accepted: true,
  cheers: true,
  dish_cheer: true,
  comment: true,
  saved_ranked: true,
  plan_invite: true,
  plan_reply: true,
  event_going: true,
  event_cancelled: true,
  event_share: true,
  place_share: true,
  dish_nudge: true,
  friends_love: true,
  taste_match: true,
  mention: true,
}
const kinds = Object.keys(KINDS) as schema.NotificationKind[]

const ctx = { actor: 'Ana', place: 'Lumbre', event: 'Noche de vinos', dish: 'Pizza', data: null }

describe('pushCopy', () => {
  test('every kind has a body in both languages', () => {
    for (const kind of kinds) {
      for (const locale of ['es', 'en'] as const) {
        const { title, body } = pushCopy(kind, locale, {
          ...ctx,
          data: { label: 'pizza', count: 4 },
        })
        expect(title).toBe('Mesa')
        expect(body.length).toBeGreaterThan(5)
        expect(body).not.toContain('undefined')
        expect(body).not.toContain('null')
      }
    }
  })

  test('the actor and the place are named', () => {
    expect(pushCopy('cheers', 'es', ctx).body).toBe('Ana le dio cheers a tu ranking de Lumbre')
    expect(pushCopy('cheers', 'en', ctx).body).toBe('Ana cheered your ranking of Lumbre')
    expect(pushCopy('follow', 'en', ctx).body).toBe('Ana started following you')
    expect(pushCopy('place_share', 'es', ctx).body).toBe('Ana te envió Lumbre')
    expect(pushCopy('place_share', 'en', ctx).body).toBe('Ana sent you Lumbre')
    expect(pushCopy('follow_request', 'en', ctx).body).toBe('Ana requested to follow you')
    expect(pushCopy('follow_request', 'es', ctx).body).toBe('Ana quiere seguirte')
    expect(pushCopy('follow_accepted', 'en', ctx).body).toBe('Ana accepted your follow request')
  })

  test("a missing actor or place falls back to a plain word, in the reader's language", () => {
    const bare = { ...ctx, actor: '  ', place: null }
    expect(pushCopy('cheers', 'es', bare).body).toBe(
      'Alguien le dio cheers a tu ranking de un lugar',
    )
    expect(pushCopy('cheers', 'en', bare).body).toBe('Someone cheered your ranking of a place')
  })

  test('a comment quotes what was said, and falls back to the ranking without it', () => {
    const said = { ...ctx, data: { excerpt: 'Qué buen lugar' } }
    expect(pushCopy('comment', 'es', said).body).toBe('Ana comentó: “Qué buen lugar”')
    expect(pushCopy('comment', 'en', said).body).toBe('Ana commented: “Qué buen lugar”')
    expect(pushCopy('comment', 'es', ctx).body).toBe('Ana comentó tu ranking de Lumbre')
  })

  test('a plan reply says which answer it was, and a bare vote says voted', () => {
    const reply = (r: schema.NotificationData['reply']) =>
      pushCopy('plan_reply', 'en', { ...ctx, data: { reply: r } }).body
    expect(reply('going')).toBe('Ana is going to your plan')
    expect(reply('maybe')).toBe('Ana might come to your plan')
    expect(reply('declined')).toBe("Ana can't make your plan")
    expect(reply(null)).toBe('Ana voted on your plan')
    expect(pushCopy('plan_reply', 'es', { ...ctx, data: { vote: true } }).body).toBe(
      'Ana votó en tu plan',
    )
  })

  test('the dish nudge names the dish and how many places', () => {
    const nudge = { ...ctx, data: { label: 'pizza', count: 4 } }
    expect(pushCopy('dish_nudge', 'es', nudge).body).toBe(
      'Has comido pizza en 4 lugares. ¿Cuál fue el mejor?',
    )
    expect(pushCopy('dish_nudge', 'en', nudge).body).toBe(
      "You've had pizza at 4 places. Which was best?",
    )
  })

  test('friends-love is about the place, and says so differently when you have been', () => {
    const not = { ...ctx, actor: null, data: { count: 3, went: false } }
    const been = { ...ctx, actor: null, data: { count: 3, went: true } }
    expect(pushCopy('friends_love', 'en', not).body).toBe(
      'The people you follow love Lumbre. You should go.',
    )
    expect(pushCopy('friends_love', 'es', not).body).toBe(
      'A la gente que sigues le encanta Lumbre. Deberías ir.',
    )
    expect(pushCopy('friends_love', 'en', been).body).toBe(
      "The people you follow love Lumbre, a place you've been",
    )
    expect(pushCopy('friends_love', 'es', been).body).toBe(
      'A la gente que sigues le encanta Lumbre, donde ya fuiste',
    )
  })

  test('a mention quotes what was said, and still reads without it', () => {
    const said = { ...ctx, data: { excerpt: 'cenamos con @bo' } }
    expect(pushCopy('mention', 'en', said).body).toBe('Ana mentioned you: “cenamos con @bo”')
    expect(pushCopy('mention', 'es', said).body).toBe('Ana te mencionó: “cenamos con @bo”')
    expect(pushCopy('mention', 'en', ctx).body).toBe('Ana mentioned you')
    expect(pushCopy('mention', 'es', ctx).body).toBe('Ana te mencionó')
  })

  test('a taste match names the person and the percent', () => {
    const match = { ...ctx, data: { percent: 93 } }
    expect(pushCopy('taste_match', 'en', match).body).toBe('You and Ana are now a 93% taste match')
    expect(pushCopy('taste_match', 'es', match).body).toBe('Tú y Ana ya tienen 93% de match')
  })
})

describe('pushPayload', () => {
  const row = (kind: schema.NotificationKind, over: Partial<NotificationRow>): NotificationRow => ({
    id: 'n1',
    userId: 'me',
    kind,
    dedupeKey: 'k',
    actorId: null,
    restaurantId: null,
    rankingId: null,
    commentId: null,
    dishId: null,
    eventId: null,
    planId: null,
    dishListId: null,
    data: null,
    createdAt: new Date(),
    readAt: null,
    ...over,
  })

  test('opens what the app already knows how to open', () => {
    expect(pushPayload(row('follow', { actorId: 'u1' }))).toEqual({ type: 'user', userId: 'u1' })
    expect(pushPayload(row('cheers', { restaurantId: 'r1' }))).toEqual({
      type: 'restaurant',
      restaurantId: 'r1',
    })
    expect(pushPayload(row('comment', { restaurantId: 'r1' }))?.type).toBe('restaurant')
    expect(pushPayload(row('dish_cheer', { dishId: 'd1' }))).toEqual({ type: 'dish', dishId: 'd1' })
    expect(pushPayload(row('plan_reply', { planId: 'p1' }))).toEqual({ type: 'plan', planId: 'p1' })
    expect(pushPayload(row('event_cancelled', { eventId: 'e1' }))).toEqual({
      type: 'event',
      eventId: 'e1',
    })
    expect(pushPayload(row('dish_nudge', { dishListId: 'l1' }))).toEqual({
      type: 'dish-list',
      listId: 'l1',
    })
    expect(pushPayload(row('friends_love', { restaurantId: 'r1' }))).toEqual({
      type: 'restaurant',
      restaurantId: 'r1',
    })
    // A mention opens the thread it was said in (or the dish)
    expect(pushPayload(row('mention', { rankingId: 'k1', dishId: 'd1' }))).toEqual({
      type: 'comment',
      rankingId: 'k1',
    })
    expect(pushPayload(row('mention', { dishId: 'd1' }))).toEqual({ type: 'dish', dishId: 'd1' })
    // The match page is the other person's.
    expect(pushPayload(row('taste_match', { actorId: 'u2' }))).toEqual({
      type: 'match',
      userId: 'u2',
    })
  })

  test('a row whose target is gone opens nothing', () => {
    for (const kind of kinds) expect(pushPayload(row(kind, {}))).toBeUndefined()
  })
})

describe('reminderCopy', () => {
  test('says when, in both languages', () => {
    expect(reminderCopy('es', 'Cata', 24 * 3_600_000).body).toBe('Cata es mañana.')
    expect(reminderCopy('en', 'Cata', 24 * 3_600_000).body).toBe('Cata is tomorrow.')
    expect(reminderCopy('es', 'Cata', 3 * 3_600_000).body).toBe('Cata empieza en 3h.')
    expect(reminderCopy('en', 'Cata', 2 * 3_600_000).body).toBe('Cata starts in 2h.')
    expect(reminderCopy('es', 'Cata', 0).body).toBe('Cata empieza ahora.')
    expect(reminderCopy('en', 'Cata', 0).body).toBe('Cata starts now.')
  })
})

describe('excerpt', () => {
  test('keeps short text, collapsing whitespace', () => {
    expect(excerpt('  qué\n buen   lugar ')).toBe('qué buen lugar')
  })

  test('cuts long text at 80 characters with an ellipsis', () => {
    const long = 'a'.repeat(200)
    const out = excerpt(long)
    expect(out).toHaveLength(80)
    expect(out.endsWith('…')).toBe(true)
    expect(excerpt('b'.repeat(80))).toHaveLength(80)
    expect(excerpt('b'.repeat(80)).endsWith('…')).toBe(false)
  })
})
