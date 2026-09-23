// The allow-listed deep links a push's `data` payload can open — matches
// exactly what apps/api/src/lib/push.ts's triggers send. Anything else is
// ignored rather than guessed at. Split out of push.ts (which pulls in
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
  // A friend's event RSVP (apps/api/src/routes/events.ts's "friend going" push).
  if (type === 'event' && typeof data.eventId === 'string') return `/events/${data.eventId}`
  // The repeat-dish nudge (M20's sweepDishNudges).
  if (type === 'dish-list' && typeof data.listId === 'string') return `/dish-lists/${data.listId}`
  // A dish getting cheered (M22's POST /dishes/:id/cheer).
  if (type === 'dish' && typeof data.dishId === 'string') return `/dish/${data.dishId}`
  return null
}
