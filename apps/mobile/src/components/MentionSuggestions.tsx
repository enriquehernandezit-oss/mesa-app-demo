import { Pressable, Text, View } from 'react-native'

import { Caption, MAX_SCALE } from '@/components/ui'
import { Avatar } from '@/components/ui/Avatar'
import { useT } from '@/lib/i18n'
import type { MentionCandidate } from '@/lib/types'
import { useLift } from '@/theme/useLift'

// The people offered while someone types "@…" — Instagram's tagging list: face, name, @handle, the people
// you follow first. Tap one and the typed word becomes their @handle. Inline (not a sheet): the rank flow
// is a native modal, and Mesa's sheets render underneath those.
export function MentionSuggestions({
  people,
  onPick,
}: {
  people: MentionCandidate[]
  onPick: (handle: string) => void
}) {
  const t = useT()
  const lift = useLift()
  if (people.length === 0) return null
  return (
    <View className="overflow-hidden rounded-card bg-surface" style={lift}>
      {people.slice(0, 5).map((p, i) => (
        <Pressable
          key={p.id}
          accessibilityRole="button"
          accessibilityLabel={`${t('mention.tag')}: ${p.name || p.handle}`}
          onPress={() => onPick(p.handle)}
          className={`min-h-[52px] flex-row items-center gap-3 px-4 py-2 active:opacity-70 ${i > 0 ? 'border-line border-t' : ''}`}
        >
          <Avatar name={p.name || p.handle} src={p.image} size={34} />
          <View className="min-w-0 flex-1">
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={MAX_SCALE}
              className="font-ui-semibold text-subhead text-text"
            >
              {p.name || p.handle}
            </Text>
            <Caption numberOfLines={1} className="text-meta">
              @{p.handle}
            </Caption>
          </View>
        </Pressable>
      ))}
    </View>
  )
}
