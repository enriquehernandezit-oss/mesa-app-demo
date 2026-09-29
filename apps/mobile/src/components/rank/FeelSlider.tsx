import { useCallback, useRef } from 'react'
import { View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  type SharedValue,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated'

import { MAX_SCALE } from '@/components/ui'
import { clamp, nearestStop } from '@/lib/feel'
import { tapSelect } from '@/lib/haptics'
import { useColor } from '@/theme/useColor'
import type { ColorToken } from '@/theme/vars'

// The three-stop slider under the flute: "didn't love it · it was fine · loved it". A 4pt track
// that fills with burgundy, three dots where the stops are, a 30pt knob ringed in the page colour,
// and the three labels, the one you're on lit and the others dimmed.
//
// It drives a SHARED `level` (0–2) live while a finger drags — the flute and the answer word
// read the same value, so they follow the finger frame by frame — and snaps to the nearest stop
// on release (a spring, or at once under Reduce Motion), calling `onStop` with where it settled.
// A tap anywhere on the track goes straight to the nearest stop. A tick of haptics on every stop
// it passes.
//
// `mini` is the same control drawn for a dish card (26pt knob), and `unset` starts it without a
// knob or a fill — the first touch puts the knob under the finger. A dish's feeling is optional,
// so it must not read as already answered.
//
// The pan only claims a HORIZONTAL drag (`activeOffsetX`, `failOffsetY`), so it never fights the
// rank screen's own swipe-down-to-dismiss.
const TRACK = 4
const HIT = 44

export function FeelSlider({
  level,
  labels,
  onStop,
  width = 313,
  label,
  initial,
  mini,
  unset,
  unsetLabel,
  ring = 'bg',
}: {
  level: SharedValue<number>
  // The stop `level` starts on (a plain number: a shared value can't be read while rendering).
  initial: 0 | 1 | 2
  labels: readonly [string, string, string]
  // Where it settled (also called for a tap and for VoiceOver's increment/decrement).
  onStop: (stop: 0 | 1 | 2) => void
  width?: number
  // The accessible name of the whole control.
  label: string
  mini?: boolean
  // Nothing chosen yet (read on mount, and for VoiceOver's value): no knob, no fill.
  unset?: boolean
  unsetLabel?: string
  // The ring round the knob is the colour of whatever it sits on.
  ring?: ColorToken
}) {
  const KNOB = mini ? 26 : 30
  const RING = mini ? 3 : 4
  const ringColor = useColor(ring)
  const revealed = useSharedValue(unset ? 0 : 1)
  const reduced = useReducedMotion()
  const settled = useRef<0 | 1 | 2>(initial)
  const startLevel = useSharedValue(0)
  const lastTick = useSharedValue<number>(initial)

  const settle = useCallback(
    (stop: 0 | 1 | 2) => {
      settled.current = stop
      onStop(stop)
    },
    [onStop],
  )
  const goTo = useCallback(
    (stop: 0 | 1 | 2) => {
      revealed.value = 1
      level.value = reduced ? stop : withSpring(stop, { damping: 20, stiffness: 240, mass: 0.7 })
      lastTick.value = stop
      if (stop !== settled.current) tapSelect()
      settle(stop)
    },
    [level, lastTick, revealed, reduced, settle],
  )

  const pan = Gesture.Pan()
    .activeOffsetX([-8, 8])
    .failOffsetY([-12, 12])
    .onBegin((e) => {
      // Unset: the knob appears where the finger lands.
      if (revealed.value === 0) {
        level.value = clamp((e.x / width) * 2, 0, 2)
        revealed.value = 1
      }
      startLevel.value = level.value
    })
    .onUpdate((e) => {
      const next = clamp(startLevel.value + (e.translationX / width) * 2, 0, 2)
      level.value = next
      const stop = nearestStop(next)
      if (stop !== lastTick.value) {
        lastTick.value = stop
        runOnJS(tapSelect)()
      }
    })
    .onEnd(() => {
      runOnJS(goTo)(nearestStop(level.value))
    })
  const tap = Gesture.Tap()
    .maxDistance(10)
    .onEnd((e) => {
      runOnJS(goTo)(nearestStop((clamp(e.x, 0, width) / width) * 2))
    })

  const fillStyle = useAnimatedStyle(() => ({
    width: (level.value / 2) * width,
    opacity: revealed.value,
  }))
  const knobStyle = useAnimatedStyle(() => ({
    left: (level.value / 2) * width - KNOB / 2,
    opacity: revealed.value,
  }))

  const step = (dir: 1 | -1) => goTo(clamp(settled.current + dir, 0, 2) as 0 | 1 | 2)

  return (
    <View style={{ width }}>
      <GestureDetector gesture={Gesture.Race(pan, tap)}>
        <View
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={label}
          accessibilityValue={{ text: unset && unsetLabel ? unsetLabel : labels[settled.current] }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(e) => step(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
          style={{ height: HIT, justifyContent: 'center' }}
        >
          <View
            className="absolute inset-x-0 rounded-[2px] bg-line-strong"
            style={{ height: TRACK, top: (HIT - TRACK) / 2 }}
          />
          {[0, 0.5, 1].map((f) => (
            <View
              key={f}
              className="absolute h-[6px] w-[6px] rounded-pill bg-line-strong"
              style={{ left: f * width - 3, top: HIT / 2 - 3 }}
            />
          ))}
          <Animated.View
            className="absolute left-0 rounded-[2px] bg-accent-fill"
            style={[{ height: TRACK, top: (HIT - TRACK) / 2 }, fillStyle]}
          />
          <Animated.View
            className="absolute rounded-pill bg-accent-fill"
            style={[
              {
                width: KNOB,
                height: KNOB,
                top: (HIT - KNOB) / 2,
                boxShadow: `0 0 0 ${RING}px ${ringColor}`,
              },
              knobStyle,
            ]}
          />
        </View>
      </GestureDetector>
      <View className="mt-2" style={{ height: 22 }} pointerEvents="none">
        {labels.map((text, j) => (
          <StopLabel key={j} text={text} stop={j} level={level} revealed={revealed} />
        ))}
      </View>
    </View>
  )
}

// One label: full strength when its stop is the one, dimmed otherwise, fading as the knob passes.
function StopLabel({
  text,
  stop,
  level,
  revealed,
}: {
  text: string
  stop: number
  level: SharedValue<number>
  revealed: SharedValue<number>
}) {
  // Unset: every label is dimmed alike (none is "the one you're on").
  const style = useAnimatedStyle(() => ({
    opacity: 0.38 + 0.62 * clamp(1 - Math.abs(level.value - stop), 0, 1) * revealed.value,
  }))
  // First flush left, last flush right (a hair outside the track's ends, as drawn), the middle
  // centred on its dot.
  const place =
    stop === 0
      ? { left: -4 }
      : stop === 2
        ? { right: -4 }
        : { left: 0, right: 0, alignItems: 'center' as const }
  return (
    <Animated.View style={[{ position: 'absolute', top: 0 }, place, style]}>
      <Animated.Text
        numberOfLines={1}
        maxFontSizeMultiplier={MAX_SCALE}
        className="font-ui-semibold text-label text-text"
      >
        {text}
      </Animated.Text>
    </Animated.View>
  )
}
