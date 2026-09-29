import { Pressable, Text, View } from 'react-native'

import { MAX_SCALE } from '@/components/ui'
import { useT } from '@/lib/i18n'
import { displayScore, scoreWordKey } from '@/lib/score'
import { useLift } from '@/theme/useLift'
import { DATA_FIGURES } from '@/theme/vars'

// The three attributed scores in a row: Everyone · Friends · You. Every score on Mesa says
// whose it is — never "the place's". A stat with nothing to show yet reads "–" (You, before
// you have ranked it). `everyone` is left out entirely under Settings → Friends-only scores.
export type Stat = { score: number | null; label: string; onPress?: () => void }

export function PlaceStats({ stats }: { stats: Stat[] }) {
  return (
    <View className="flex-row gap-2 px-4 pt-1.5">
      {stats.map((s) => (
        <StatCard key={s.label} stat={s} />
      ))}
    </View>
  )
}

function StatCard({ stat }: { stat: Stat }) {
  const t = useT()
  const lift = useLift()
  const body = (
    <View className="rounded-[20px] bg-surface px-3 pb-2.5 pt-3" style={lift}>
      <View className="flex-row items-baseline gap-[5px]">
        <Text
          style={DATA_FIGURES}
          maxFontSizeMultiplier={MAX_SCALE}
          className="font-serif text-serif-xl text-text"
        >
          {stat.score == null ? '–' : displayScore(stat.score)}
        </Text>
        {stat.score != null ? (
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={MAX_SCALE}
            className="shrink font-ui-semibold text-eyebrow text-accent"
          >
            {t(scoreWordKey(stat.score))}
          </Text>
        ) : null}
      </View>
      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={MAX_SCALE}
        className="mt-1 font-ui text-micro text-text-muted"
      >
        {stat.label}
      </Text>
    </View>
  )
  return stat.onPress ? (
    <Pressable
      accessibilityRole="button"
      onPress={stat.onPress}
      className="flex-1 active:opacity-80"
    >
      {body}
    </Pressable>
  ) : (
    <View className="flex-1">{body}</View>
  )
}
