import { type ReactNode } from 'react'
import { Pressable, Text, View, useWindowDimensions } from 'react-native'

import { MAX_SCALE } from '@/components/ui'
import { Glass } from '@/components/ui/Glass'
import { ChevronIcon, PinIcon } from '@/components/ui/icons'
import { heroNameSize } from '@/lib/nameCard'
import { useColor } from '@/theme/useColor'
import { useLift } from '@/theme/useLift'

// `hot` turns the chip into the accent pill — "live now", "starts in 40 min" — the one tag that
// should read at a glance.
export type PlaceTag = {
  key: string
  icon?: ReactNode
  label: string
  onPress?: () => void
  hot?: boolean
}

// What sits ON the photo, low on the page: the category chip, the frosted name panel, the
// frosted panel of tags, and a hint that there is more below. The photo itself is the page's
// fixed backdrop; this block scrolls up over it and away as the details sheet rises. The place
// page and the event page share it: the chip's `icon` (a pin for a place, the kind's icon for an
// event) and the name's largest size (`titleSize`) are the two things that differ.
//
// `bottom` is the room to leave under the hint for the floating bar.
export function PlaceHero({
  name,
  category,
  icon,
  titleSize = 46,
  sub,
  tags,
  hint,
  bottom,
}: {
  name: string
  category: string
  icon?: ReactNode
  titleSize?: number
  sub: string
  tags: PlaceTag[]
  hint: string
  bottom: number
}) {
  const lift = useLift('float')
  const shade = useColor('photo-scrim')
  // The name's size is worked out from the name and the room (see heroNameSize), not left to iOS
  // shrink-to-fit. The room is the screen less the hero's 18pt sides and the panel's 18pt padding.
  const { width, fontScale } = useWindowDimensions()
  const nameSize = heroNameSize(name, width - 72, titleSize, Math.min(fontScale, MAX_SCALE))
  return (
    <View className="flex-1 justify-end px-[18px]" style={{ paddingBottom: bottom }}>
      <View className="mb-3 items-center">
        <View
          className="h-9 flex-row items-center gap-[7px] rounded-pill bg-surface px-[15px]"
          style={lift}
        >
          {icon ?? <PinIcon size={15} color="text" />}
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={MAX_SCALE}
            className="font-ui-semibold text-pill text-text"
          >
            {category}
          </Text>
        </View>
      </View>

      <Glass variant="panel" radius={30} className="items-center px-[18px] pb-[18px] pt-5">
        <Text
          numberOfLines={3}
          maxFontSizeMultiplier={MAX_SCALE}
          style={{ fontSize: nameSize, lineHeight: Math.round(nameSize * 1.05) }}
          className="text-center font-serif text-hglass-fg"
        >
          {name}
        </Text>
        <Text
          numberOfLines={2}
          maxFontSizeMultiplier={MAX_SCALE}
          className="mt-2 text-center font-ui text-label text-hglass-fg opacity-70"
        >
          {sub}
        </Text>
      </Glass>

      {tags.length > 0 ? (
        <Glass variant="panel" radius={30} className="mt-3 p-[13px]">
          <View className="flex-row flex-wrap justify-center gap-2">
            {tags.map((tag) => {
              const chip = (
                <View
                  className={`h-[34px] flex-row items-center gap-1.5 rounded-pill px-3 ${tag.hot ? 'bg-accent-fill' : 'bg-hchip'}`}
                >
                  {tag.icon}
                  <Text
                    numberOfLines={1}
                    maxFontSizeMultiplier={MAX_SCALE}
                    className={`font-ui-semibold text-label ${tag.hot ? 'text-on-accent' : 'text-hglass-fg'}`}
                  >
                    {tag.label}
                  </Text>
                </View>
              )
              return tag.onPress ? (
                <Pressable
                  key={tag.key}
                  accessibilityRole="button"
                  onPress={tag.onPress}
                  className="active:opacity-70"
                >
                  {chip}
                </Pressable>
              ) : (
                <View key={tag.key}>{chip}</View>
              )
            })}
          </View>
        </Glass>
      ) : null}

      <View className="mt-6 flex-row items-center justify-center gap-1.5">
        <View style={{ transform: [{ rotate: '90deg' }] }}>
          <ChevronIcon size={14} color="on-photo" strokeWidth={2.2} />
        </View>
        <Text
          maxFontSizeMultiplier={MAX_SCALE}
          className="font-ui-semibold text-meta text-on-photo"
          style={{ textShadowColor: shade, textShadowRadius: 8 }}
        >
          {hint}
        </Text>
      </View>
    </View>
  )
}
