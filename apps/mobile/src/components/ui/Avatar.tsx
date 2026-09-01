import { useColor } from '@/theme/useColor'
import type { ColorToken } from '@/theme/vars'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { Text, View } from 'react-native'

// One avatar everywhere: a photo when the user has one, else their initial on a
// warm gradient ringed in brass. Ported from apps/app/src/components/ui/Avatar.
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
}: { name: string; src?: string | null; size?: number }) {
  const ring = useColor('accent')
  const hue = useColor(hueFor(name))
  const sunk = useColor('bg-sunk')
  const ink = useColor('avatar-ink')
  const initial = name.trim().charAt(0).toUpperCase() || 'M'

  if (src) {
    return (
      <Image
        source={{ uri: src }}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 1,
          borderColor: ring,
        }}
        contentFit="cover"
        transition={120}
      />
    )
  }
  return (
    <LinearGradient
      colors={[hue, sunk]}
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
      <Text className="font-ui-semibold" style={{ color: ink, fontSize: size * 0.44 }}>
        {initial}
      </Text>
    </LinearGradient>
  )
}
