import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import Animated from 'react-native-reanimated'

import { useRankBarBottom } from '@/components/place/RankBar'
import { MAX_SCALE } from '@/components/ui'
import { BookmarkFilledIcon, BookmarkIcon, CheckIcon } from '@/components/ui/icons'
import type { useEventRsvp } from '@/hooks/useEventRsvp'
import { useEventSave } from '@/hooks/useEventSave'
import { useT } from '@/lib/i18n'
import type { EventSummary } from '@/lib/types'
import { useLift } from '@/theme/useLift'

import { BurstDots, usePop } from './motion'

// The event page's floating bar: a round save chip and the one action, "I'm going", as a burgundy
// capsule (settling to solid ink with a check once you are — tap again to undo). A cancelled event
// keeps the bar's place but says so instead. Absolutely placed over the scroll, like the place
// page's rank bar.
export const EVENT_BAR_HEIGHT = 56

export function EventBar({
  e,
  rsvpState,
}: {
  e: EventSummary
  // The page's useEventRsvp — shared so the spots bar in the sheet moves with this tap.
  rsvpState: ReturnType<typeof useEventRsvp>
}) {
  const t = useT()
  const bottom = useRankBarBottom()
  const lift = useLift('float')
  const save = useEventSave(e)
  const savePop = usePop()
  const goingPop = usePop()
  const [burst, setBurst] = useState(0)
  const going = rsvpState.rsvp === 'going'

  return (
    <View
      className="absolute inset-x-4 flex-row items-center gap-2.5"
      style={{ bottom, height: EVENT_BAR_HEIGHT }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={save.saved ? t('events.unsave_cta') : t('events.save_cta')}
        accessibilityState={{ selected: save.saved }}
        onPress={() => {
          savePop.pop()
          save.toggle()
        }}
        className="items-center justify-center rounded-pill bg-chip active:opacity-80"
        style={[{ width: EVENT_BAR_HEIGHT, height: EVENT_BAR_HEIGHT }, lift]}
      >
        <Animated.View style={savePop.style}>
          {save.saved ? (
            <BookmarkFilledIcon size={22} color="accent" />
          ) : (
            <BookmarkIcon size={22} color="text" />
          )}
        </Animated.View>
      </Pressable>

      {e.cancelled ? (
        <View className="h-full flex-1 items-center justify-center rounded-pill bg-bg-sunk">
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={MAX_SCALE}
            className="font-ui-semibold text-body text-text-muted"
          >
            {t('events.cancelled_title')}
          </Text>
        </View>
      ) : (
        <Animated.View style={goingPop.style} className="h-full flex-1">
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: going }}
            onPress={() => {
              goingPop.pop()
              if (!going) setBurst((b) => b + 1)
              rsvpState.toggle('going')
            }}
            className={`h-full flex-row items-center justify-center gap-2 rounded-pill active:opacity-90 ${going ? 'bg-ink' : 'bg-accent-fill'}`}
            style={lift}
          >
            {going ? <CheckIcon size={18} color="on-ink" strokeWidth={2.2} /> : null}
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={MAX_SCALE}
              className={`font-ui-semibold text-body ${going ? 'text-on-ink' : 'text-on-accent'}`}
            >
              {going ? t('events.going_done') : t('events.going_cta')}
            </Text>
            <BurstDots trigger={burst} color="accent" />
          </Pressable>
        </Animated.View>
      )}
    </View>
  )
}
