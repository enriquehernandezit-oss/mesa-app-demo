import { db, schema } from '@mesa/db'
import { and, eq, inArray, isNull, ne, notInArray, or, sql } from 'drizzle-orm'

import { extractHandles } from './mentions'
import { type NotifyInput, background, notifyNow } from './notify'
import { excerpt } from './notifyCopy'
import { followerIds } from './visibility'

// Turning the @handles in a note, a comment or a dish caption into notifications. There is no mentions
// table: the text is the record, and the inbox row (one per person per place it was said) is the only
// thing stored.
//
// Who is told, of the people named:
//   · they exist and are not banned (a handle nobody owns is just text);
//   · not the author, and not anyone in `skip` (a comment's ranking owner already gets the comment);
//   · they may SEE the content — if its owner's account is private, only the owner and their approved
//     followers; a mention must never be a way to show a private note to a stranger. (Blocks either
//     way are dropped by notify() itself, for every kind.)
// An edit that adds a name tells the new person; the unique key keeps the old ones from hearing twice.

const { user } = schema

export interface MentionSource {
  // Who wrote it.
  authorId: string
  // Whose content it is (a comment lives under someone else's ranking; a note or caption is the
  // author's own): their privacy decides who may be told.
  ownerId: string
  text: string
  // Where it was said, unique per place: `note:<rankingId>`, `comment:<commentId>`, `dish:<dishId>`.
  key: string
  skip?: string[]
  // What the inbox row points at.
  rankingId?: string
  commentId?: string
  dishId?: string
  restaurantId?: string
}

export async function mentionInputs(src: MentionSource): Promise<NotifyInput[]> {
  const handles = extractHandles(src.text)
  if (handles.length === 0) return []
  const people = await db
    .select({ id: user.id })
    .from(user)
    .where(
      and(
        inArray(user.handle, handles),
        isNull(user.bannedAt),
        ne(user.id, src.authorId),
        (src.skip ?? []).length > 0 ? notInArray(user.id, src.skip ?? []) : undefined,
        or(
          sql`not (select is_private from "user" where id = ${src.ownerId})`,
          eq(user.id, src.ownerId),
          inArray(user.id, followerIds(src.ownerId)),
        ),
      ),
    )
  const text = excerpt(src.text)
  return people.map((p) => ({
    userId: p.id,
    kind: 'mention' as const,
    dedupeKey: `mention:${src.key}`,
    actorId: src.authorId,
    rankingId: src.rankingId ?? null,
    commentId: src.commentId ?? null,
    dishId: src.dishId ?? null,
    restaurantId: src.restaurantId ?? null,
    data: { excerpt: text },
  }))
}

// Fire-and-forget, like notify(): the write the text came with never waits on, or fails because of, this.
export function notifyMentions(src: MentionSource): void {
  if (!src.text.includes('@')) return
  background(async () => notifyNow(await mentionInputs(src)), 'mention notify failed')
}
