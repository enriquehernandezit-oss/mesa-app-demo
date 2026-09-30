import { Pressable, Text } from 'react-native'

import { MAX_SCALE } from '@/components/ui'
import { type FollowSource, useFollow } from '@/hooks/useFollow'
import { useT } from '@/lib/i18n'
import type { FollowStatus } from '@/lib/types'

// The small pill on an Activity row and on a follow request: solid ink "Follow back" when you don't
// follow them yet, a quiet chip once you do ("Following") or have asked ("Requested", for a private
// account). One implementation for both places.
export function FollowBackPill({
  userId,
  initial,
  from,
}: {
  userId: string
  initial: boolean | FollowStatus
  from: FollowSource
}) {
  const t = useT()
  const { status, toggle, pending } = useFollow(userId, initial, from)
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: status !== 'none', disabled: pending }}
      disabled={pending}
      onPress={toggle}
      className={`h-[32px] justify-center rounded-pill px-4 active:opacity-70 ${status !== 'none' ? 'bg-chip' : 'bg-ink'} ${pending ? 'opacity-60' : ''}`}
    >
      <Text
        maxFontSizeMultiplier={MAX_SCALE}
        className={`font-ui-semibold text-meta ${status !== 'none' ? 'text-text-muted' : 'text-on-ink'}`}
      >
        {status === 'following'
          ? t('activity.following_pill')
          : status === 'requested'
            ? t('activity.requested_pill')
            : t('activity.follow_back')}
      </Text>
    </Pressable>
  )
}
