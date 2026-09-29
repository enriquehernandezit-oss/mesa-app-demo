import { useFocusEffect } from 'expo-router'
import { memo, useCallback } from 'react'
import { View } from 'react-native'
import Animated, {
  type SharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
} from 'react-native-reanimated'
import Svg, {
  Circle,
  ClipPath,
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg'

import { bubbleFrame, bubblePhase, levelValue, twinkleOpacity } from '@/lib/feel'
import { useResolvedTheme } from '@/theme/ThemeProvider'

import {
  CLING,
  FEW,
  FOG,
  MANY,
  MOUSSE,
  RISE_TO_Y,
  type Rise,
  SPRAY,
  SURFACE_Y,
  type Spark,
} from './fluteData'

// The "How was it?" picture: a champagne flute of Kir Royale that answers the slider. At
// "didn't love it" the drink has gone flat and dull; at "it was fine" a slow thin stream of
// bubbles climbs a cold, misted glass; at "loved it" five lively streams rise, a ring of foam
// sits on the surface and a fizz breathes over the rim. Between the stops everything crossfades,
// live, as the finger moves (`level`, 0–2).
//
// Drawn from the approved design (docs/design/rating/F17-Bubbles.dc.html). The glass and drink are
// SVG, in two layers with the bubbles between them; the bubbles and the fizz are ~50 plain native
// Views (an opacity + a transform each) all driven by ONE clock, so they run on the UI thread with
// no React work per frame. Raw colours are allowed in this file (docs/DESIGN.md "Where color is
// allowed to live"): this is an illustration, and it must look the same wherever it is shown.
//
// The clock stops when the screen isn't focused, and with Reduce Motion it never starts — the
// flute is then a still frame that still answers the slider.

const OUTER =
  'M 123 34 C 121 92 127 152 145 196 L 155 196 C 173 152 179 92 177 34 A 27 5 0 0 0 123 34 Z'
const CAVITY =
  'M 125.5 35 C 123.5 92 129 150 146.5 192 L 153.5 192 C 171 150 176.5 92 174.5 35 A 24.5 4.5 0 0 0 125.5 35 Z'
const BOWL = 'M 123 34 C 121 92 127 152 145 196 L 155 196 C 173 152 179 92 177 34 Z'
const STEM = 'M 146.5 196 C 148 212 148 240 147.4 258 L 152.6 258 C 152 240 152 212 153.5 196 Z'

const AnimatedG = Animated.createAnimatedComponent(G)

export const Flute = memo(function Flute({
  level,
  size = 300,
}: {
  // 0 = didn't love it · 1 = it was fine · 2 = loved it, continuous while dragging.
  level: SharedValue<number>
  size?: number
}) {
  const night = useResolvedTheme() === 'night'
  const reduced = useReducedMotion()
  // Seconds on the one clock every bubble reads.
  const now = useSharedValue(0)
  const { setActive } = useFrameCallback((frame) => {
    now.value = frame.timeSinceFirstFrame / 1000
  }, false)
  useFocusEffect(
    useCallback(() => {
      setActive(!reduced)
      return () => setActive(false)
    }, [setActive, reduced]),
  )
  const k = size / 300

  return (
    <View
      // A picture, not content: the slider and the word beside it say the answer.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={{ width: size, height: size }}
    >
      <Glass level={level} night={night} size={size} layer="back" />
      <Layer level={level} at={[0, 1, 1]}>
        {FEW.map((b, i) => (
          <Bubble key={i} b={b} k={k} now={now} level={level} at={[0, 1, 1]} />
        ))}
      </Layer>
      <Layer level={level} at={[0, 0, 1]}>
        {MANY.map((b, i) => (
          <Bubble key={i} b={b} k={k} now={now} level={level} at={[0, 0, 1]} />
        ))}
        {SPRAY.map((s, i) => (
          <Sparkle key={i} s={s} k={k} now={now} night={night} level={level} />
        ))}
      </Layer>
      <Glass level={level} night={night} size={size} layer="front" />
    </View>
  )
})

// A group of views whose visibility follows the level: [flat, fine, loved].
function Layer({
  level,
  at,
  children,
}: {
  level: SharedValue<number>
  at: readonly [number, number, number]
  children: React.ReactNode
}) {
  const style = useAnimatedStyle(() => ({ opacity: levelValue(level.value, at[0], at[1], at[2]) }))
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', inset: 0 }, style]}>
      {children}
    </Animated.View>
  )
}

const Bubble = memo(function Bubble({
  b,
  k,
  now,
  level,
  at,
}: {
  b: Rise
  k: number
  now: SharedValue<number>
  level: SharedValue<number>
  at: readonly [number, number, number]
}) {
  const d = b.r * 2 * k
  const rise = (b.y - RISE_TO_Y) * k
  const style = useAnimatedStyle(() => {
    // A stream that isn't showing isn't worth a frame of maths.
    if (levelValue(level.value, at[0], at[1], at[2]) <= 0.01) return { opacity: 0 }
    const f = bubbleFrame(bubblePhase(now.value, b.dur, b.delay))
    return { opacity: f.opacity, transform: [{ translateY: -rise * f.lift }, { scale: f.scale }] }
  })
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: (b.x - b.r) * k,
          top: (b.y - b.r) * k,
          width: d,
          height: d,
          borderRadius: d / 2,
          borderWidth: 0.6 * k,
          borderColor: 'rgba(255,250,246,0.9)',
          backgroundColor: 'rgba(255,255,255,0.3)',
        },
        style,
      ]}
    />
  )
})

// One speck of the fizz over the rim.
const Sparkle = memo(function Sparkle({
  s,
  k,
  now,
  night,
  level,
}: {
  s: Spark
  k: number
  now: SharedValue<number>
  night: boolean
  level: SharedValue<number>
}) {
  const d = s.r * 2 * k
  const style = useAnimatedStyle(() => ({
    opacity: level.value > 1.02 ? twinkleOpacity(now.value, s.delay) : 0,
  }))
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: (s.x - s.r) * k,
          top: (s.y - s.r) * k,
          width: d,
          height: d,
          borderRadius: d / 2,
          backgroundColor: night ? '#f4ede2' : '#8a6a60',
        },
        style,
      ]}
    />
  )
})

// The glass itself. `back` is everything the bubbles sit in front of (the shadow, the drink, the
// foam, the mist); `front` is what lies over them (the glass's edge, its highlights, the stem,
// the foot and the rim). Static except for three groups that crossfade with the level.
const Glass = memo(function Glass({
  level,
  night,
  size,
  layer,
}: {
  level: SharedValue<number>
  night: boolean
  size: number
  layer: 'back' | 'front'
}) {
  const edge = night ? 'rgba(244,237,226,0.38)' : 'rgba(40,28,24,0.34)'
  const flatProps = useAnimatedProps(() => ({ opacity: levelValue(level.value, 1, 0, 0) }))
  const fogProps = useAnimatedProps(() => ({ opacity: levelValue(level.value, 0, 0.7, 1) }))
  const foamProps = useAnimatedProps(() => ({ opacity: levelValue(level.value, 0, 0, 1) }))

  if (layer === 'front') {
    return (
      <Svg
        width={size}
        height={size}
        viewBox="0 0 300 300"
        style={{ position: 'absolute', left: 0, top: 0 }}
      >
        <Defs>
          <LinearGradient id="ks" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#fff" stopOpacity={0} />
            <Stop offset="0.1" stopColor="#fff" stopOpacity={night ? 0.75 : 0.9} />
            <Stop offset="0.75" stopColor="#fff" stopOpacity={0.45} />
            <Stop offset="1" stopColor="#fff" stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Path d={OUTER} fill="none" stroke={edge} strokeWidth={1.1} />
        <Path
          d="M 127 44 C 126 92 130 142 142 182 L 144.6 182 C 133 142 129.6 92 130.6 44 Z"
          fill="url(#ks)"
        />
        <Path
          d="M 172 50 C 173 92 170 138 159 178 L 160.4 178 C 171.4 138 174.6 92 173.6 50 Z"
          fill="url(#ks)"
          opacity={0.55}
        />
        <Path
          d={STEM}
          fill="#ffffff"
          fillOpacity={night ? 0.12 : 0.45}
          stroke={edge}
          strokeWidth={0.9}
        />
        <Path
          d="M 148.6 204 L 148.9 252"
          stroke="#ffffff"
          strokeOpacity={0.8}
          strokeWidth={1}
          strokeLinecap="round"
        />
        <Ellipse
          cx={150}
          cy={264}
          rx={36}
          ry={7}
          fill="#ffffff"
          fillOpacity={night ? 0.1 : 0.4}
          stroke={edge}
          strokeWidth={0.9}
        />
        <Ellipse
          cx={150}
          cy={262}
          rx={36}
          ry={7}
          fill="#ffffff"
          fillOpacity={night ? 0.08 : 0.35}
          stroke={edge}
          strokeWidth={1}
        />
        <Path
          d="M 118 263.5 A 32 5.5 0 0 0 182 263.5"
          fill="none"
          stroke="#ffffff"
          strokeOpacity={0.8}
          strokeWidth={1.3}
          strokeLinecap="round"
        />
        <Path
          d="M 123 34 A 27 5 0 0 0 177 34"
          fill="none"
          stroke="#ffffff"
          strokeOpacity={0.95}
          strokeWidth={1.5}
        />
        {night ? null : (
          <Path
            d="M 123 35.2 A 27 5 0 0 0 177 35.2"
            fill="none"
            stroke="rgba(40,28,24,0.28)"
            strokeWidth={0.9}
          />
        )}
      </Svg>
    )
  }

  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 300 300"
      style={{ position: 'absolute', left: 0, top: 0 }}
    >
      <Defs>
        <ClipPath id="cavity">
          <Path d={CAVITY} />
        </ClipPath>
        <ClipPath id="below">
          <Rect x={0} y={SURFACE_Y + 1} width={300} height={240} />
        </ClipPath>
        <ClipPath id="bowl">
          <Path d={BOWL} />
        </ClipPath>
        <LinearGradient id="kr" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#7a1a2d" />
          <Stop offset="0.55" stopColor="#561020" />
          <Stop offset="1" stopColor="#2a050c" />
        </LinearGradient>
        <LinearGradient id="kf" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#5e3134" />
          <Stop offset="1" stopColor="#291214" />
        </LinearGradient>
        <LinearGradient id="ky" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#000" stopOpacity={0.5} />
          <Stop offset="0.2" stopColor="#000" stopOpacity={0.08} />
          <Stop offset="0.36" stopColor="#fff" stopOpacity={0.08} />
          <Stop offset="0.6" stopColor="#000" stopOpacity={0} />
          <Stop offset="1" stopColor="#000" stopOpacity={0.55} />
        </LinearGradient>
        <RadialGradient id="shadow">
          <Stop offset="0" stopColor="#3c2618" stopOpacity={night ? 0 : 0.28} />
          <Stop offset="1" stopColor="#3c2618" stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="pool">
          <Stop offset="0" stopColor="#7a1a29" stopOpacity={1} />
          <Stop offset="1" stopColor="#7a1a29" stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="glow">
          <Stop offset="0" stopColor="#8e1d31" stopOpacity={1} />
          <Stop offset="1" stopColor="#8e1d31" stopOpacity={0} />
        </RadialGradient>
      </Defs>

      <Ellipse cx={150} cy={268} rx={62} ry={10} fill="url(#shadow)" />
      <Ellipse
        cx={166}
        cy={269}
        rx={38}
        ry={9}
        fill="url(#pool)"
        fillOpacity={night ? 0.3 : 0.22}
      />

      <Path d={OUTER} fill={night ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.3)'} />
      <Path d="M 123 34 A 27 5 0 0 1 177 34" fill="none" stroke={edge} strokeWidth={1.1} />

      <G clipPath="url(#cavity)">
        <Rect x={120} y={SURFACE_Y} width={60} height={140} fill="url(#kr)" />
        <AnimatedG animatedProps={flatProps}>
          <Rect x={120} y={SURFACE_Y} width={60} height={140} fill="url(#kf)" />
        </AnimatedG>
        <Rect x={120} y={SURFACE_Y} width={60} height={140} fill="url(#ky)" />
        <Ellipse cx={150} cy={186} rx={20} ry={21} fill="url(#glow)" fillOpacity={0.35} />
        <Ellipse cx={150} cy={SURFACE_Y} rx={25} ry={4.6} fill="#661526" />
        <Path
          d={`M 125 ${SURFACE_Y} A 25 4.6 0 0 0 175 ${SURFACE_Y}`}
          fill="none"
          stroke="#ffffff"
          strokeOpacity={0.45}
          strokeWidth={1}
        />
        <AnimatedG animatedProps={foamProps} clipPath="url(#below)">
          {CLING.map(([x, y, r], i) => (
            <Circle
              key={i}
              cx={x}
              cy={y}
              r={r}
              fill="none"
              stroke="rgba(255,248,244,0.75)"
              strokeWidth={0.6}
            />
          ))}
        </AnimatedG>
      </G>
      <AnimatedG animatedProps={foamProps}>
        {MOUSSE.map(([x, y, r], i) => (
          <Circle key={i} cx={x} cy={y} r={r} fill="#f6eadf" fillOpacity={0.85} />
        ))}
      </AnimatedG>

      <AnimatedG animatedProps={fogProps} clipPath="url(#bowl)">
        <G clipPath="url(#below)">
          <Rect
            x={118}
            y={SURFACE_Y}
            width={64}
            height={140}
            fill="#ffffff"
            fillOpacity={night ? 0.03 : 0.14}
          />
          {FOG.map(([x, y, r, o], i) => (
            <Circle
              key={i}
              cx={x}
              cy={y}
              r={r}
              fill="#ffffff"
              fillOpacity={o * (night ? 0.6 : 1)}
            />
          ))}
        </G>
      </AnimatedG>
    </Svg>
  )
})
