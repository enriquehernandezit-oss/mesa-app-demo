import { Link } from 'expo-router'
import { memo } from 'react'
import { Pressable, Text, View } from 'react-native'

import { Caption, MAX_SCALE } from '@/components/ui'
import { Avatar } from '@/components/ui/Avatar'
import { useT } from '@/lib/i18n'
import type { ExploreMember } from '@/lib/types'
import { useLift } from '@/theme/useLift'

// A member result — a raised card that opens their passport. Wrapped in memo() — same reasoning
// as HitRow.
export const MemberRow = memo(function MemberRow({ m }: { m: ExploreMember }) {
  const t = useT()
  const lift = useLift()
  return (
    <Link href={`/u/${m.id}`} asChild>
      <Pressable
        className="mb-2 flex-row items-center gap-3 rounded-group bg-surface px-3 py-2.5 active:opacity-80"
        style={lift}
      >
        <Avatar name={m.name || m.handle || 'm'} src={m.image} size={44} />
        <View className="min-w-0 flex-1">
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={MAX_SCALE}
            className="font-serif text-serif-sm text-text"
          >
            {m.name || m.handle}
          </Text>
          <Caption numberOfLines={1}>
            {[
              m.handle ? `@${m.handle}` : null,
              t('settings.ranked_count', { n: m.rankedCount }),
              m.neighborhood,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Caption>
        </View>
      </Pressable>
    </Link>
  )
})
