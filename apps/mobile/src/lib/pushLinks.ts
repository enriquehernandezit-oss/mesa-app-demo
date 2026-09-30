// The allow-listed deep links a push's `data` payload can open — matches
// exactly what apps/api/src/lib/notifyCopy.ts's pushPayload (and the event-reminder
// sweep) send. Anything else is ignored rather than guessed at. Split out of push.ts (which pulls in
// expo-notifications/expo-secure-store and so can't be unit-tested without an
// RN runtime — see that file's own header) so this pure mapping can be, the
// same way deepLinks.ts is split from its own caller.
export function pushDeepLink(data: Record<string, unknown> | undefined): string | null {
  if (!data) return null
  const type = data.type
  if (type === 'user' && typeof data.userId === 'string') return `/u/${data.userId}`
  if (type === 'restaurant' && typeof data.restaurantId === 'string')
    return `/r/${data.restaurantId}`
  if (type === 'plan' && typeof data.planId === 'string') return `/plans/${data.planId}`
  // A friend's event RSVP (lib/notify.ts's event_going).
  if (type === 'event' && typeof data.eventId === 'string') return `/events/${data.eventId}`
  // The repeat-dish nudge (lib/pushSweep.ts's sweepDishNudges).
  if (type === 'dish-list' && typeof data.listId === 'string') return `/dish-lists/${data.listId}`
  // A dish getting cheered (POST /dishes/:id/cheer).
  if (type === 'dish' && typeof data.dishId === 'string') return `/dish/${data.dishId}`
  // The targets the notification matrix will send as its kinds land (N3+): a comment's
  // thread, a taste-match page, a curated list, a menu, and the Activity list itself. The
  // app learns them first, over the air, so a push sent later is never dead on an older app.
  if (type === 'comment' && typeof data.rankingId === 'string') return `/comments/${data.rankingId}`
  if (type === 'match' && typeof data.userId === 'string') return `/match/${data.userId}`
  if (type === 'list' && typeof data.slug === 'string') return `/lists/${data.slug}`
  if (type === 'menu' && typeof data.restaurantId === 'string') return `/menu/${data.restaurantId}`
  if (type === 'activity') return '/activity'
  return null
}
