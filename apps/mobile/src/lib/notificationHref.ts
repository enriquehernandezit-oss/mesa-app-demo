import type { NotificationItem } from './types'

// Where tapping an Activity row goes. The same screens a push of that kind opens (see
// pushLinks.ts), decided from what the row points at; null when the thing it pointed at is
// gone (the row still renders, it just isn't tappable).
export function notificationHref(n: NotificationItem): string | null {
  switch (n.kind) {
    case 'follow':
    case 'follow_accepted':
      return n.actor ? `/u/${n.actor.id}` : null
    // Asked to follow you: the requests list (the inbox doesn't list these rows itself).
    case 'follow_request':
      return '/follow-requests'
    case 'cheers':
    case 'saved_ranked':
    case 'friends_love':
    case 'place_share':
      return n.restaurant ? `/r/${n.restaurant.id}` : null
    // A comment opens its thread.
    case 'comment':
      return n.rankingId
        ? `/comments/${n.rankingId}`
        : n.restaurant
          ? `/r/${n.restaurant.id}`
          : null
    case 'dish_cheer':
      return n.dish ? `/dish/${n.dish.id}` : null
    // Where it was said: the thread under a ranking (its note and comments), or the dish.
    case 'mention':
      return n.rankingId ? `/comments/${n.rankingId}` : n.dish ? `/dish/${n.dish.id}` : null
    case 'plan_invite':
    case 'plan_reply':
      return n.planId ? `/plans/${n.planId}` : null
    case 'event_going':
    case 'event_cancelled':
    case 'event_share':
      return n.event ? `/events/${n.event.id}` : null
    case 'dish_nudge':
      return n.dishListId ? `/dish-lists/${n.dishListId}` : null
    // The taste-match page with that person.
    case 'taste_match':
      return n.actor ? `/match/${n.actor.id}` : null
  }
}
