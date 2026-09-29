import { useRouter } from 'expo-router'
import { Pressable, ScrollView, Text, View } from 'react-native'

import { PhotoChip, photoChipText } from '@/components/feed/PhotoChip'
import { Caption, MAX_SCALE, SectionHeader } from '@/components/ui'
import { PlaceCover } from '@/components/ui/PlaceCover'
import { useT } from '@/lib/i18n'
import { imageUrl } from '@/lib/media'
import type { HomeRestaurant } from '@/lib/types'

// "New near you": places added in the last few weeks, that someone has ranked, in the
// member's own neighborhoods. A shelf of 150-wide cards, each a picture (the photo, else
// the name card) with a "New" pill on it, then the name and "cuisine · neighborhood".
export function NewNearYou({ places }: { places: HomeRestaurant[] }) {
  const t = useT()
  const router = useRouter()
  if (places.length === 0) return null
  return (
    <View className="mb-2 mt-1">
      <View className="px-5">
        <SectionHeader>{t('home.new_near_you')}</SectionHeader>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2.5 px-4 pb-3"
      >
        {places.map((p) => {
          const onPhoto = imageUrl(p.coverImageId) !== null
          return (
            <Pressable
              key={p.id}
              accessibilityRole="button"
              onPress={() => router.push(`/r/${p.id}`)}
              className="w-[150px] active:opacity-90"
            >
              <View className="h-[120px] overflow-hidden rounded-[22px]">
                <PlaceCover
                  name={p.name}
                  coverImageId={p.coverImageId}
                  size={{ w: 300, h: 240 }}
                  className="h-full w-full rounded-none"
                />
                <PhotoChip
                  onPhoto={onPhoto}
                  radius={11}
                  className="absolute left-2 top-2 h-[22px] justify-center px-2"
                >
                  <Text className={`font-ui-semibold text-eyebrow ${photoChipText(onPhoto)}`}>
                    {t('home.new_badge')}
                  </Text>
                </PhotoChip>
              </View>
              <Text
                numberOfLines={1}
                maxFontSizeMultiplier={MAX_SCALE}
                className="mt-[7px] font-serif text-serif-xs text-text"
              >
                {p.name}
              </Text>
              <Caption numberOfLines={1}>
                {[p.cuisine, p.neighborhood].filter(Boolean).join(' · ')}
              </Caption>
            </Pressable>
          )
        })}
      </ScrollView>
    </View>
  )
}
