import { Link } from 'expo-router'
import { type ReactNode, useEffect } from 'react'
import { Pressable, Text, View } from 'react-native'

import { Caption } from '@/components/ui'
import { Avatar } from '@/components/ui/Avatar'
import { type FollowSource, followLabelKey, useFollow } from '@/hooks/useFollow'
import { useT } from '@/lib/i18n'
import type { FollowStatus } from '@/lib/types'
import { useLift } from '@/theme/useLift'

type PersonRowUser = {
  id: string
  name: string
  handle?: string | null
  image?: string | null
  neighborhood?: string | null
}

// One person row, reused everywhere the app lists members to look at or act
// on: onboarding's friend-find, the empty feed's suggestions, and the
// followers/following screen. Avatar + name + a caption is one Link to the
// person's passport — replacing three hand-rolled versions of this row, one
// of which (onboarding) had no avatar at all. `right` is caller-owned (a
// follow pill here, M3's invite checkbox there) so this stays a pure list row
// with no follow logic of its own. `subtitle` defaults to "@handle · sector"
// but takes an override — the empty feed's row shows "N rankeados · sector"
// instead, a stronger follow-motivator there than a bare handle. `last` drops
// the hairline for the final row inside a grouped white card.
export function PersonRow({
  user,
  subtitle,
  right,
  below,
  last,
}: {
  user: PersonRowUser
  subtitle?: string
  right?: ReactNode
  // A line under the name, outside the profile link (so it can be a control of its own) —
  // the "Followed by …" line.
  below?: ReactNode
  last?: boolean
}) {
  const caption =
    subtitle ??
    [user.handle ? `@${user.handle}` : null, user.neighborhood].filter(Boolean).join(' · ')
  return (
    <View className={`py-3 ${last ? '' : 'border-line border-b'}`}>
      <View className="flex-row items-center gap-3">
        <Link href={`/u/${user.id}`} asChild>
          <Pressable
            accessibilityRole="button"
            className="min-w-0 flex-1 flex-row items-center gap-3 active:opacity-80"
          >
            <Avatar name={user.name || user.handle || 'm'} src={user.image} size={42} />
            <View className="min-w-0 flex-1">
              <Text className="font-serif text-serif-sm text-text" numberOfLines={1}>
                {user.name || user.handle}
              </Text>
              <Caption numberOfLines={1}>{caption}</Caption>
            </View>
          </Pressable>
        </Link>
        {right}
      </View>
      {below ? <View className="mt-1.5 pl-[54px]">{below}</View> : null}
    </View>
  )
}

// The follow pill `PersonRow`'s `right` slot most often carries — one
// implementation shared by onboarding's friend-find, the empty feed's
// suggestions, and the followers/following screen, all of which used to hand-
// roll their own copy of this exact markup around `useFollow`.
export function FollowPill({
  userId,
  initial,
  from,
  onChange,
}: {
  userId: string
  initial: boolean | FollowStatus
  from: FollowSource
  onChange?: (following: boolean) => void
}) {
  const t = useT()
  const lift = useLift()
  const { status, following, toggle, pending } = useFollow(userId, initial, from)

  // `onChange` is typically a fresh closure per render (callers building it
  // inline inside a `.map()`); only `following` itself should re-trigger this.
  // oxlint-disable react/exhaustive-deps -- see above.
  useEffect(() => {
    onChange?.(following)
  }, [following])
  // oxlint-enable react/exhaustive-deps

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: status !== 'none', disabled: pending }}
      disabled={pending}
      onPress={toggle}
      // Follow is the call to action (solid ink); Following and Requested settle to a raised chip.
      className={`min-h-[34px] justify-center rounded-pill px-4 ${status !== 'none' ? 'bg-chip' : 'bg-ink'} ${pending ? 'opacity-60' : ''} active:opacity-70`}
      style={status !== 'none' ? lift : undefined}
    >
      <Text
        className={`font-ui-semibold text-label ${status !== 'none' ? 'text-text' : 'text-on-ink'}`}
      >
        {t(followLabelKey(status))}
      </Text>
    </Pressable>
  )
}
