import { Image } from 'expo-image'
import { useState } from 'react'
import { Text, View } from 'react-native'

import { imageUrl } from '@/lib/media'
import { type NameCardTone, nameCardFontSize, nameCardTone } from '@/lib/nameCard'
import { useColor } from '@/theme/useColor'

// The cover for a place: its photo, else a NAME CARD — the place's name set in the
// serif on a card that is burgundy, cream or black (chosen from the name, so a place
// always wears the same one). Never a letter tile or a generated stamp: an empty
// picture is still an honest one (docs/DESIGN.md "The picture rule"). Sizes to its container — the caller sets width/height via className; `size`
// only asks the image host for a delivery size (see lib/media.ts).
//
// The name scales with the box (a thumbnail sets it small, a hero large) and shrinks to
// fit rather than clip, up to three lines. Its line height leaves room for a capital's
// accent ("KIJÁ"), which a tight 1.1 clipped.
export function PlaceCover({
  name,
  coverImageId,
  size,
  className,
}: {
  name: string
  coverImageId?: string | null
  size?: { w?: number; h?: number }
  className?: string
}) {
  const cover = imageUrl(coverImageId, size)

  if (cover) {
    return (
      <View className={`overflow-hidden rounded bg-bg-sunk ${className ?? ''}`}>
        <Image
          source={{ uri: cover }}
          style={{ width: '100%', height: '100%' }}
          contentFit="cover"
          transition={120}
        />
      </View>
    )
  }
  return <NameCard name={name} className={className} />
}

// The three colourways, drawn from tokens that do not change with the theme (burgundy is the
// accent fill, cream and black are the rank bar's two colours), so a card reads the same by day
// and at night. Cream and black carry a hairline ring; burgundy needs none.
const TONE: Record<NameCardTone, { card: string; text: string; ring: boolean }> = {
  burgundy: { card: 'bg-accent-fill', text: 'text-on-accent', ring: false },
  cream: { card: 'bg-on-bar', text: 'text-bar', ring: true },
  black: { card: 'bg-bar', text: 'text-on-bar', ring: true },
}

function NameCard({ name, className }: { name: string; className?: string }) {
  const line = useColor('line-strong')
  const [box, setBox] = useState<{ w: number; h: number } | null>(null)
  const fontSize = box ? nameCardFontSize(name, box.w, box.h) : 0
  const tone = TONE[nameCardTone(name)]
  return (
    <View
      onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      className={`items-center justify-center overflow-hidden rounded p-1.5 ${tone.card} ${className ?? ''}`}
      style={tone.ring ? { boxShadow: `inset 0 0 0 1px ${line}` } : undefined}
    >
      {box ? (
        <Text
          numberOfLines={3}
          // A picture, not a paragraph: its size follows the box, not the text-size setting.
          allowFontScaling={false}
          className={`text-center font-serif ${tone.text}`}
          style={{ fontSize, lineHeight: Math.round(fontSize * 1.25) }}
        >
          {name}
        </Text>
      ) : null}
    </View>
  )
}
