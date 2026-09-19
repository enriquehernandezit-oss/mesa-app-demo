import { useColor } from '@/theme/useColor'
import type { ColorToken } from '@/theme/vars'
import { useEffect } from 'react'
import { View } from 'react-native'
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'

// Eventos' shared motion vocabulary — one easing, short durations (≤320ms),
// and every effect degrades to a plain fade (or nothing) under iOS Reduce
// Motion. Kept here so the screens only say WHAT moves, not how.
export const EASE = Easing.out(Easing.cubic)

// Staggered entrance for list cards: fade + rise 12pt, 40ms apart, capped so a
// long list doesn't wait seconds for its tail.
export function useStaggerEntering(index: number) {
  const reduced = useReducedMotion()
  if (reduced) return FadeIn.duration(160)
  return FadeInDown.duration(280)
    .delay(Math.min(index, 8) * 40)
    .withInitialValues({ opacity: 0, transform: [{ translateY: 12 }] })
}

// The "¡Hoy!" live dot: a solid dot with a ring that breathes outward. The
// only ambient loop in Eventos; static under Reduce Motion.
export function PulseDot({ color, size = 8 }: { color: ColorToken; size?: number }) {
  const c = useColor(color)
  const reduced = useReducedMotion()
  const p = useSharedValue(0)
  useEffect(() => {
    if (reduced) return
    p.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.out(Easing.quad) }), -1)
  }, [p, reduced])
  const ring = useAnimatedStyle(() => ({
    opacity: 0.6 * (1 - p.value),
    transform: [{ scale: 1 + p.value * 1.6 }],
  }))
  return (
    <View style={{ width: size, height: size }}>
      <Animated.View
        style={[
          {
            position: 'absolute',
            width: size,
            height: size,
            borderRadius: size,
            backgroundColor: c,
          },
          ring,
        ]}
      />
      <View style={{ width: size, height: size, borderRadius: size, backgroundColor: c }} />
    </View>
  )
}

const BURST_ANGLES = Array.from({ length: 8 }, (_, i) => (i / 8) * Math.PI * 2)

// A ring of 8 dots bursting outward and fading — the "Voy" celebration.
// Re-fires every time `trigger` changes to a new truthy value.
export function BurstDots({ trigger, color }: { trigger: number; color: ColorToken }) {
  const c = useColor(color)
  const reduced = useReducedMotion()
  const p = useSharedValue(0)
  useEffect(() => {
    if (!trigger || reduced) return
    p.value = 0
    p.value = withTiming(1, { duration: 520, easing: EASE })
  }, [trigger, p, reduced])
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: '50%', top: '50%' }}>
      {BURST_ANGLES.map((angle) => (
        <BurstDot key={angle} angle={angle} color={c} p={p} />
      ))}
    </View>
  )
}

function BurstDot({
  angle,
  color,
  p,
}: {
  angle: number
  color: string
  p: { value: number }
}) {
  const style = useAnimatedStyle(() => {
    const r = 10 + p.value * 30
    return {
      opacity: p.value === 0 ? 0 : 1 - p.value,
      transform: [
        { translateX: Math.cos(angle) * r },
        { translateY: Math.sin(angle) * r },
        { scale: 1 - p.value * 0.4 },
      ],
    }
  })
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          width: 6,
          height: 6,
          borderRadius: 3,
          marginLeft: -3,
          marginTop: -3,
          backgroundColor: color,
        },
        style,
      ]}
    />
  )
}

// Press "pop": springs a scale down and back. Returns the style + a trigger.
export function usePop() {
  const s = useSharedValue(1)
  const reduced = useReducedMotion()
  const style = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }))
  const pop = () => {
    if (reduced) return
    s.value = withSequence(
      withTiming(0.9, { duration: 90, easing: EASE }),
      withTiming(1.06, { duration: 140, easing: EASE }),
      withTiming(1, { duration: 120, easing: EASE }),
    )
  }
  return { style, pop }
}

// A progress bar whose fill animates to `ratio` (0–1).
export function AnimatedBar({
  ratio,
  fillClass,
  trackClass = 'bg-bg-sunk',
  height = 6,
}: {
  ratio: number
  fillClass: string
  trackClass?: string
  height?: number
}) {
  const w = useSharedValue(0)
  useEffect(() => {
    w.value = withDelay(
      120,
      withTiming(Math.max(0, Math.min(1, ratio)), { duration: 420, easing: EASE }),
    )
  }, [ratio, w])
  const style = useAnimatedStyle(() => ({ width: `${w.value * 100}%` }))
  return (
    <View className={`overflow-hidden rounded-pill ${trackClass}`} style={{ height }}>
      <Animated.View className={`h-full rounded-pill ${fillClass}`} style={style} />
    </View>
  )
}
