import { cloudinaryUrl } from '@/lib/media'
import { useColor } from '@/theme/useColor'
import { Image } from 'expo-image'
import type { ReactNode } from 'react'
import { View } from 'react-native'
import { Circle, G, Line, Rect, Svg, Text as SvgText } from 'react-native-svg'

// The cover for a place: its photo, else a deterministic generated mark so the
// catalog never shows a blank box. Ported from apps/app/src/components/ui/
// PlaceCover.tsx. The Mesa-tinted static-map fallback (for geocoded-but-photoless
// places) lands with maps in N7; without a token mapboxStaticUrl is null anyway,
// so it correctly falls through to the mark. Sizes to its container — the caller
// sets width/height via className; `size` is only the Cloudinary fetch size.
function fnv1a(str: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

function marks(stroke: string): ReactNode[] {
  const sp = { stroke, strokeWidth: 3, fill: 'none' as const }
  return [
    <Circle key="0" cx={140} cy={70} r={46} {...sp} />,
    <G key="1">
      <Line x1={28} y1={30} x2={150} y2={150} {...sp} />
      <Line x1={168} y1={36} x2={66} y2={180} {...sp} />
    </G>,
    <G key="2">
      <Circle cx={80} cy={120} r={30} {...sp} />
      <Circle cx={120} cy={90} r={30} {...sp} />
    </G>,
    <G key="3">
      <Line x1={26} y1={70} x2={174} y2={70} {...sp} />
      <Line x1={26} y1={100} x2={174} y2={100} {...sp} />
      <Line x1={26} y1={130} x2={174} y2={130} {...sp} />
    </G>,
    <Rect key="4" x={55} y={55} width={90} height={90} rotation={45} origin="100, 100" {...sp} />,
    <G key="5">
      <Line x1={20} y1={20} x2={20} y2={100} {...sp} />
      <Line x1={20} y1={20} x2={100} y2={20} {...sp} />
      <Line x1={20} y1={20} x2={120} y2={120} {...sp} />
    </G>,
  ]
}

export function PlaceCover({
  seed,
  name,
  coverImageId,
  size,
  className,
}: {
  seed: string
  name: string
  coverImageId?: string | null
  size?: { w?: number; h?: number }
  className?: string
}) {
  const faint = useColor('text-faint')
  const cover = cloudinaryUrl(coverImageId, size)
  const box = `overflow-hidden rounded bg-bg-sunk ${className ?? ''}`

  if (cover) {
    return (
      <View className={box}>
        <Image
          source={{ uri: cover }}
          style={{ width: '100%', height: '100%' }}
          contentFit="cover"
          transition={120}
        />
      </View>
    )
  }
  const initial = name.trim().charAt(0).toUpperCase() || 'M'
  return (
    <View className={box}>
      <Svg width="100%" height="100%" viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice">
        {marks(faint)[fnv1a(seed) % 6]}
        <SvgText
          x={100}
          y={126}
          textAnchor="middle"
          fill={faint}
          fontSize={64}
          fontFamily="JetBrainsMono_400Regular"
        >
          {initial}
        </SvgText>
      </Svg>
    </View>
  )
}
