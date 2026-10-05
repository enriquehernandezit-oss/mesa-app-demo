import { useRouter } from 'expo-router'
import { Pressable, View } from 'react-native'

import { Caption } from '@/components/ui'
import { Avatar } from '@/components/ui/Avatar'
import { useT } from '@/lib/i18n'
import { mutualLine } from '@/lib/mutualLine'
import type { MutualSummary } from '@/lib/types'

// "Followed by Ana, Luis and 3 more", with up to three faces — which of MY people (the people I
// follow and the people who follow me) follow this person. The whole line opens the full list,
// on the people screen's Mutual tab. Renders nothing when there is nobody in common.
//
// `ring` is the colour of what the faces sit on, so the overlap reads as a cut-out: white
// (surface) inside a card, cream (bg) on the bare page.
export function MutualLine({
  userId,
  mutual,
  ring = 'surface',
  center,
}: {
  userId: string
  mutual: MutualSummary
  ring?: 'surface' | 'bg'
  center?: boolean
}) {
  const t = useT()
  const router = useRouter()
  const text = mutualLine(t, mutual)
  if (!text) return null
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${text}. ${t('friends.mutual_a11y')}`}
      onPress={() => router.push(`/people/${userId}?tab=mutual`)}
      hitSlop={6}
      className={`min-h-[28px] flex-row items-center gap-2 active:opacity-70 ${center ? 'justify-center' : ''}`}
    >
      <MutualFaces mutual={mutual} ring={ring} />
      <Caption numberOfLines={2} className="min-w-0 shrink text-meta">
        {text}
      </Caption>
    </Pressable>
  )
}

export function MutualFaces({
  mutual,
  ring = 'surface',
  size = 22,
}: {
  mutual: MutualSummary
  ring?: 'surface' | 'bg'
  size?: number
}) {
  return (
    <View className="flex-row items-center">
      {mutual.sample.map((p, i) => (
        <View
          key={p.id}
          style={{ marginLeft: i === 0 ? 0 : -size / 3, zIndex: 10 - i }}
          className={`rounded-pill border-2 ${ring === 'bg' ? 'border-bg' : 'border-surface'}`}
        >
          <Avatar name={p.name} src={p.image} size={size} />
        </View>
      ))}
    </View>
  )
}
