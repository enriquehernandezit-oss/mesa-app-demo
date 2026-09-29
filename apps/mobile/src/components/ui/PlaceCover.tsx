import { Image } from 'expo-image'
import { useState } from 'react'
import { Text, View } from 'react-native'

import { imageUrl } from '@/lib/media'
import { useColor } from '@/theme/useColor'

// The cover for a place: its photo, else a NAME CARD — the place's name set in the
// serif on a plain raised card with a hairline ring. Never a letter tile or a
// generated stamp: an empty picture is still an honest one (docs/DESIGN.md "The picture
// rule"). Sizes to its container — the caller sets width/height via className; `size`
// only asks the image host for a delivery size (see lib/media.ts).
//
// The name scales with the box (a thumbnail sets it small, a hero large) and shrinks to
// fit rather than clip, up to three lines.
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

function NameCard({ name, className }: { name: string; className?: string }) {
  const line = useColor('line')
  const [box, setBox] = useState<{ w: number; h: number } | null>(null)
  const fontSize = box ? Math.max(11, Math.min(28, Math.round(Math.min(box.w, box.h) * 0.2))) : 0
  return (
    <View
      onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      className={`items-center justify-center overflow-hidden rounded bg-surface-raised p-1.5 ${className ?? ''}`}
      style={{ boxShadow: `inset 0 0 0 1px ${line}` }}
    >
      {box ? (
        <Text
          numberOfLines={3}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
          className="text-center font-serif text-text"
          style={{ fontSize, lineHeight: Math.round(fontSize * 1.1) }}
        >
          {name}
        </Text>
      ) : null}
    </View>
  )
}
