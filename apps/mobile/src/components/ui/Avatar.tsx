import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { Text } from 'react-native'

import { useColor } from '@/theme/useColor'
import type { ColorToken } from '@/theme/vars'

// One avatar everywhere: a photo when the user has one, else their initial on a warm
// gradient (a person's own tone fading to a light cream, dark initial on top — the same
// in both themes). No ring: a stack of overlapping avatars draws its own separator.
// Gradient hues rotate by name so a person keeps the same color everywhere.
const HUES: ColorToken[] = ['avatar-hue-1', 'avatar-hue-2', 'avatar-hue-3']
function hueFor(name: string): ColorToken {
  let sum = 0
  for (const ch of name.trim()) sum += ch.charCodeAt(0)
  return HUES[sum % HUES.length]
}

export function Avatar({
  name,
  src,
  size = 32,
}: {
  name: string
  src?: string | null
  size?: number
}) {
  const hue = useColor(hueFor(name))
  const light = useColor('avatar-light')
  const ink = useColor('avatar-ink')
  const initial = name.trim().charAt(0).toUpperCase() || 'M'

  if (src) {
    return (
      <Image
        source={{ uri: src }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        contentFit="cover"
        transition={120}
      />
    )
  }
  return (
    <LinearGradient
      colors={[hue, light]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* The initial is drawn to fit the circle, so it never scales with the text-size setting
          (at the largest size it outgrew the 88pt profile photo and was cut off). */}
      <Text
        allowFontScaling={false}
        className="font-ui-semibold"
        style={{ color: ink, fontSize: size * 0.44 }}
      >
        {initial}
      </Text>
    </LinearGradient>
  )
}
