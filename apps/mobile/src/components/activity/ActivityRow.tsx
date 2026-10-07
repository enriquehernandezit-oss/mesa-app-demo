import { type Href, useRouter } from 'expo-router'
import { Fragment, type ReactNode, memo } from 'react'
import { Pressable, Text, View } from 'react-native'

import { FollowBackPill } from '@/components/FollowBackPill'
import { Caption, MAX_SCALE } from '@/components/ui'
import { Avatar } from '@/components/ui/Avatar'
import { CalendarIcon, ForkKnifeIcon } from '@/components/ui/icons'
import { PlaceCover } from '@/components/ui/PlaceCover'
import { useT } from '@/lib/i18n'
import { notificationHref } from '@/lib/notificationHref'
import { splitTemplate } from '@/lib/richText'
import { timeAgo } from '@/lib/time'
import type { NotificationItem } from '@/lib/types'

type T = ReturnType<typeof useT>

// The sentence for a row, still carrying its {tokens}: the dictionary owns the word order.
function templateFor(n: NotificationItem, t: T): string {
  switch (n.kind) {
    case 'follow':
      return t('activity.follow')
    case 'follow_request':
      return t('activity.follow_request')
    case 'follow_accepted':
      return t('activity.follow_accepted')
    case 'cheers':
      return t('activity.cheers')
    case 'dish_cheer':
      return t('activity.dish_cheer')
    case 'comment':
      return t('activity.comment')
    case 'saved_ranked':
      return t('activity.saved_ranked')
    case 'plan_invite':
      return t('activity.plan_invite')
    // A reply wins over the vote that came with it (the same rule the push uses).
    case 'plan_reply':
      return n.data?.reply === 'going'
        ? t('activity.plan_reply_going')
        : n.data?.reply === 'maybe'
          ? t('activity.plan_reply_maybe')
          : n.data?.reply === 'declined'
            ? t('activity.plan_reply_declined')
            : t('activity.plan_reply_vote')
    // Collapsed to one row per event by the server: "Ana and 42 others are going to X".
    case 'event_going':
      return n.others > 0
        ? t('activity.event_going_others', { n: n.others })
        : t('activity.event_going')
    case 'event_cancelled':
      return t('activity.event_cancelled')
    case 'event_share':
      return t('activity.event_share')
    case 'dish_nudge':
      return t('activity.dish_nudge', { n: n.data?.count ?? 3 })
    case 'friends_love':
      return n.data?.went ? t('activity.friends_love_went') : t('activity.friends_love')
    case 'taste_match':
      return t('activity.taste_match')
    case 'mention':
      return t('activity.mention')
  }
}

// One row of the bell (Redesign 2): a 40pt face (or an icon when no person is behind it), the
// sentence with names in semibold, when it happened, and on the right either a Follow back
// pill or the place's photo. A dot in the left gutter marks what is still unread. The whole
// row opens what it is about; the person's name and the place's name open theirs directly.
// memo(): the list is virtualized but each row runs its own useFollow, so a re-render of the
// screen (a filter tap, a page arriving) must not re-render rows whose data didn't change.
export const ActivityRow = memo(function ActivityRow({ n }: { n: NotificationItem }) {
  const t = useT()
  const router = useRouter()
  const href = notificationHref(n)
  const open = (to: string) => router.push(to as Href)

  const bold = (text: string, to?: string) => (
    <Text
      maxFontSizeMultiplier={MAX_SCALE}
      className="font-ui-semibold"
      onPress={to ? () => open(to) : undefined}
      suppressHighlighting
    >
      {text}
    </Text>
  )
  const tokens: Record<string, ReactNode> = {
    name: bold(
      n.actor?.name || n.actor?.handle || t('activity.someone'),
      n.actor ? `/u/${n.actor.id}` : undefined,
    ),
    place: bold(
      n.restaurant?.name ?? t('activity.a_place'),
      n.restaurant ? `/r/${n.restaurant.id}` : undefined,
    ),
    dish: bold(n.dish?.name ?? t('activity.a_dish')),
    event: bold(n.event?.title ?? t('activity.an_event')),
    label: bold(n.data?.label ?? ''),
    percent: bold(`${n.data?.percent ?? 90}%`),
  }
  const sentence = splitTemplate(templateFor(n, t)).map((part, i) => (
    <Fragment key={i}>{'token' in part ? tokens[part.token] : part.text}</Fragment>
  ))

  return (
    <Pressable
      accessibilityRole="button"
      disabled={!href}
      onPress={() => href && open(href)}
      className="flex-row items-start gap-3 border-line border-b py-3 active:opacity-80"
    >
      {/* Unread dot, in the gutter the list's side padding leaves. */}
      {n.read ? null : (
        <View className="absolute left-[-14px] top-[28px] h-2 w-2 rounded-pill bg-accent-fill" />
      )}
      {n.actor ? (
        <Avatar name={n.actor.name || n.actor.handle || 'm'} src={n.actor.image} size={40} />
      ) : (
        <View className="h-[40px] w-[40px] items-center justify-center rounded-pill bg-chip">
          {n.kind === 'dish_nudge' || n.kind === 'friends_love' ? (
            <ForkKnifeIcon size={18} />
          ) : (
            <CalendarIcon size={18} />
          )}
        </View>
      )}
      <View className="min-w-0 flex-1">
        <Text
          maxFontSizeMultiplier={MAX_SCALE}
          className="font-ui text-subhead leading-[21px] text-text"
        >
          {sentence}
        </Text>
        {(n.kind === 'comment' || n.kind === 'mention') && n.data?.excerpt ? (
          <Text
            numberOfLines={2}
            maxFontSizeMultiplier={MAX_SCALE}
            className="mt-1 font-ui text-subhead leading-[21px] text-text-2"
          >
            “{n.data.excerpt}”
          </Text>
        ) : null}
        <Caption className="mt-[3px] text-meta">{timeAgo(n.createdAt)}</Caption>
      </View>
      {n.kind === 'follow' && n.actor ? (
        <FollowBackPill
          userId={n.actor.id}
          initial={n.followStatus ?? n.followsBack}
          from="activity"
        />
      ) : n.restaurant ? (
        <View className="h-[46px] w-[46px] overflow-hidden rounded-sm">
          <PlaceCover
            name={n.restaurant.name}
            coverImageId={n.restaurant.coverImageId}
            size={{ w: 96, h: 96 }}
            className="h-full w-full rounded-none"
          />
        </View>
      ) : null}
    </Pressable>
  )
})
