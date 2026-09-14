import { Caption } from '@/components/ui'
import { Avatar } from '@/components/ui/Avatar'
import { type FollowSource, useFollow } from '@/hooks/useFollow'
import { Link } from 'expo-router'
import { type ReactNode, useEffect } from 'react'
import { Pressable, Text, View } from 'react-native'

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
// instead, a stronger follow-motivator there than a bare handle.
export function PersonRow({
  user,
  subtitle,
  right,
}: { user: PersonRowUser; subtitle?: string; right?: ReactNode }) {
  const caption =
    subtitle ??
    [user.handle ? `@${user.handle}` : null, user.neighborhood].filter(Boolean).join(' · ')
  return (
    <View className="flex-row items-center gap-3 border-line border-b py-3">
      <Link href={`/u/${user.id}`} asChild>
        <Pressable
          accessibilityRole="button"
          className="min-w-0 flex-1 flex-row items-center gap-3 active:opacity-80"
        >
          <Avatar name={user.name || user.handle || 'm'} src={user.image} size={36} />
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
  initial: boolean
  from: FollowSource
  onChange?: (following: boolean) => void
}) {
  const { following, toggle, pending } = useFollow(userId, initial, from)

  // `onChange` is typically a fresh closure per render (callers building it
  // inline inside a `.map()`); only `following` itself should re-trigger this.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above.
  useEffect(() => {
    onChange?.(following)
  }, [following])

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: following, disabled: pending }}
      disabled={pending}
      onPress={toggle}
      className={`min-h-[36px] justify-center rounded-pill border px-4 ${following ? 'border-accent bg-accent-fill' : 'border-line'} active:opacity-70`}
    >
      <Text
        className={`font-mono text-eyebrow ${following ? 'text-accent-strong' : 'text-text-muted'}`}
      >
        {following ? 'Siguiendo' : 'Seguir'}
      </Text>
    </Pressable>
  )
}
