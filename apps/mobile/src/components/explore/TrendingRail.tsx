import { useQuery } from '@tanstack/react-query'
import { Link } from 'expo-router'
import { Pressable, ScrollView, Text, View } from 'react-native'

import { PhotoChip, photoChipText } from '@/components/feed/PhotoChip'
import { MAX_SCALE, SectionHeader } from '@/components/ui'
import { FlameIcon } from '@/components/ui/icons'
import { PlaceCover } from '@/components/ui/PlaceCover'
import { track } from '@/lib/analytics'
import { api } from '@/lib/api'
import { useT } from '@/lib/i18n'
import { imageUrl } from '@/lib/media'
import type { RailSpot } from '@/lib/types'

// What Santo Domingo is cheering this fortnight — a genuinely different signal from Explore's
// friend-score default, which is why it earns a rail here rather than a third rail on Discover
// (where the feed IS the product).
//
// The card carries ONLY the cheer count, on a flame. Never a score, never a ScoreBadge: a bare number
// beside a place reads as the place's own rating, and in Mesa every score is attributed to a person.
// Cheers are activity, not a verdict.
export function TrendingRail() {
  const t = useT()
  const q = useQuery({
    queryKey: ['trending'],
    queryFn: () => {
      track('trending_opened')
      return api.get<{ restaurants: RailSpot[] }>('/restaurants/trending')
    },
    staleTime: 300_000,
  })
  const spots = q.data?.restaurants ?? []
  // Under four qualifying spots the rail reads as broken rather than sparse — a cold graph should
  // show nothing at all.
  if (spots.length < 4) return null
  return (
    <View>
      <SectionHeader>{t('explore.trending_title')}</SectionHeader>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        className="-mx-5"
        contentContainerClassName="gap-2.5 px-5 pb-3.5 pt-1"
      >
        {spots.map((s) => {
          const onPhoto = imageUrl(s.coverImageId) !== null
          return (
            <Link key={s.id} href={`/r/${s.id}`} asChild>
              <Pressable
                accessibilityLabel={`${s.name}, ${t('explore.cheers_this_week', { n: s.cheerCount ?? 0 })}`}
                className="w-[132px] active:opacity-80"
              >
                <View className="h-[104px] overflow-hidden rounded-[20px] bg-bg-sunk">
                  <PlaceCover
                    name={s.name}
                    coverImageId={s.coverImageId}
                    size={{ w: 300, h: 240 }}
                    className="h-full w-full rounded-none"
                  />
                  <View className="absolute bottom-2 left-2">
                    <PhotoChip
                      onPhoto={onPhoto}
                      radius={11}
                      className="h-[22px] flex-row items-center gap-1 px-2"
                    >
                      <FlameIcon
                        size={12}
                        color={onPhoto ? 'on-photo' : 'on-ink'}
                        strokeWidth={2}
                      />
                      <Text
                        maxFontSizeMultiplier={MAX_SCALE}
                        className={`font-ui-semibold text-eyebrow ${photoChipText(onPhoto)}`}
                      >
                        {s.cheerCount ?? 0}
                      </Text>
                    </PhotoChip>
                  </View>
                </View>
                <Text
                  numberOfLines={1}
                  maxFontSizeMultiplier={MAX_SCALE}
                  className="mt-1.5 font-serif text-serif-xs text-text"
                >
                  {s.name}
                </Text>
              </Pressable>
            </Link>
          )
        })}
      </ScrollView>
    </View>
  )
}
