import { useCallback, useState } from 'react'
import { View } from 'react-native'
import { useSharedValue } from 'react-native-reanimated'

import { STOP_SENTIMENT, sentimentToStop } from '@/lib/feel'
import { useT } from '@/lib/i18n'
import type { Sentiment } from '@/lib/pairwise'

import { FeelSlider } from './FeelSlider'

// The same three-stop slider as "How was it?", small, for one dish on the reveal. It starts
// UNSET — no knob until you touch it — because how a dish was is optional; the first touch
// (a tap on a stop, or a drag) sets it, and every change after that calls `onChange`.
export function MiniFeel({
  sentiment,
  onChange,
  label,
}: {
  sentiment: Sentiment | null
  onChange: (sentiment: Sentiment) => void
  // The accessible name ("How was the mofongo?").
  label: string
}) {
  const t = useT()
  // Unset starts in the middle (out of sight until touched).
  const start = sentiment ? sentimentToStop(sentiment) : 1
  const level = useSharedValue<number>(start)
  const [width, setWidth] = useState(0)
  const onStop = useCallback(
    (stop: 0 | 1 | 2) => onChange(STOP_SENTIMENT[stop] ?? 'fine'),
    [onChange],
  )
  const words = [
    t('rank.sentiment_disliked'),
    t('rank.sentiment_fine'),
    t('rank.sentiment_loved'),
  ] as const
  return (
    // The card's padding leaves room for the knob to overhang the track's ends.
    <View onLayout={(e) => setWidth(Math.floor(e.nativeEvent.layout.width))}>
      {width > 0 ? (
        <FeelSlider
          mini
          initial={start}
          ring="surface"
          unset={sentiment === null}
          unsetLabel={t('rank.dish_feel_unset')}
          level={level}
          labels={words}
          onStop={onStop}
          width={width}
          label={label}
        />
      ) : null}
    </View>
  )
}
