import type { NotificationItem } from './types'

// Where tapping an Activity row goes. The same screens a push of that kind opens (see
// pushLinks.ts), decided from what the row points at; null when the thing it pointed at is
// gone (the row still renders, it just isn't tappable).
export function notificationHref(n: NotificationItem): string | null {
  switch (n.kind) {
    case 'follow':
      return n.actor ? `/u/${n.actor.id}` : null
    case 'cheers':
    case 'saved_ranked':
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
    case 'plan_invite':
    case 'plan_reply':
      return n.planId ? `/plans/${n.planId}` : null
    case 'event_going':
    case 'event_cancelled':
      return n.event ? `/events/${n.event.id}` : null
    case 'dish_nudge':
      return n.dishListId ? `/dish-lists/${n.dishListId}` : null
  }
}
