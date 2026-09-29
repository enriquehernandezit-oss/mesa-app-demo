import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect'
import type { ReactNode } from 'react'
import { StyleSheet, View, type ViewProps } from 'react-native'

import { useResolvedTheme } from '@/theme/ThemeProvider'
import { useColor } from '@/theme/useColor'
import type { ColorToken } from '@/theme/vars'

// Mesa's translucent chrome, in one place. Three surfaces, each with the tint laid
// over a real material and a near-opaque stand-in for where there is none:
//
//   bar    — the tab bar, toasts, sticky pill rows       (glass*)
//   panel  — the frosted name/tag panels on a photograph  (hglass*: white frost by
//            day, smoked at night — light frost washes cream text out over a bright
//            photo, so this one follows the theme on purpose)
//   photo  — small controls and score pills on a photograph (pglass*: the same dark
//            tint in both themes; a photo is its own dark island)
//
// On iOS 26 the material is the system's Liquid Glass (`expo-glass-effect`), told
// Mesa's RESOLVED theme — Auto turns Night at 6pm on a light-mode phone, and the
// system's own guess would be wrong. Elsewhere (older iOS, no material) it is the
// `*-fallback` token, which must stay legible over a photo on its own.
//
// Radius is a prop, not a class: the material has to be cut to the same shape as its
// frame, and the frame's shape isn't readable from a className. Everything else
// (size, padding, layout) is the caller's `className`.
type GlassVariant = 'bar' | 'panel' | 'photo'

const TOKENS: Record<GlassVariant, { tint: ColorToken; line: ColorToken; fallback: ColorToken }> = {
  bar: { tint: 'glass', line: 'glass-line', fallback: 'glass-fallback' },
  panel: { tint: 'hglass', line: 'hglass-line', fallback: 'hglass-fallback' },
  photo: { tint: 'pglass', line: 'pglass-line', fallback: 'pglass-fallback' },
}

export function Glass({
  variant = 'bar',
  radius = 999,
  solid,
  style,
  children,
  ...rest
}: ViewProps & {
  variant?: GlassVariant
  radius?: number
  // Skip the material and use the near-opaque fallback everywhere. For a bar that sits
  // over TEXT (a sticky header): the material lets the words behind it show through.
  solid?: boolean
  children?: ReactNode
}) {
  const theme = useResolvedTheme()
  const tokens = TOKENS[variant]
  const tint = useColor(tokens.tint)
  const line = useColor(tokens.line)
  const fallback = useColor(tokens.fallback)
  // The frosted panel at Night is the smoked fill, not the system material: over a bright
  // photograph the material barely darkens (a white plate under cream text is unreadable),
  // and a panel that holds a name has to be legible on ANY photo. By day the material's white
  // frost is exactly right.
  const smoked = variant === 'panel' && theme === 'night'
  const material = !solid && !smoked && isLiquidGlassAvailable()
  return (
    <View
      style={[
        { borderRadius: radius, borderWidth: 1, borderColor: line, overflow: 'hidden' },
        style,
      ]}
      {...rest}
    >
      {material ? (
        <GlassView
          pointerEvents="none"
          colorScheme={variant === 'photo' || theme === 'night' ? 'dark' : 'light'}
          tintColor={tint}
          style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
        />
      ) : (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: fallback }]}
        />
      )}
      {children}
    </View>
  )
}
