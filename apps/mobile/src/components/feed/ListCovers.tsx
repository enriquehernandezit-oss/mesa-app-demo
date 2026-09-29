import { useQuery } from '@tanstack/react-query'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import { Pressable, Text, View } from 'react-native'

import { EmptyState, ErrorState, MAX_SCALE, SectionHeader, Skeleton } from '@/components/ui'
import { PlaceCover } from '@/components/ui/PlaceCover'
import { api } from '@/lib/api'
import { listAuthorLabel } from '@/lib/display'
import { useT } from '@/lib/i18n'
import type { FeaturedList } from '@/lib/types'
import { useColor } from '@/theme/useColor'

// The Feed's "Lists" pill: every featured list as a cover — the photo, the title set
// over a dark scrim, and how many of them you've ranked.
export function ListCovers() {
  const t = useT()
  const router = useRouter()
  const scrim = useColor('photo-scrim')
  const q = useQuery({
    queryKey: ['lists'],
    queryFn: () => api.get<{ lists: FeaturedList[] }>('/lists'),
    staleTime: 120_000,
  })
  const lists = q.data?.lists ?? []
  return (
    <View>
      <View className="px-5">
        <SectionHeader>{t('feed.featured_lists')}</SectionHeader>
      </View>
      {q.isPending ? (
        <View className="gap-3 px-4">
          {[0, 1].map((i) => (
            <View key={i} className="overflow-hidden rounded-[28px]">
              <Skeleton height={176} />
            </View>
          ))}
        </View>
      ) : q.isError ? (
        <ErrorState onRetry={() => q.refetch()} />
      ) : lists.length === 0 ? (
        <EmptyState>{t('feed.lists_empty')}</EmptyState>
      ) : (
        lists.map((l) => (
          <Pressable
            key={l.slug}
            accessibilityRole="button"
            onPress={() => router.push(`/lists/${l.slug}`)}
            className="mx-4 mb-3 h-[176px] overflow-hidden rounded-[28px] active:opacity-90"
          >
            <PlaceCover
              name={l.title}
              coverImageId={l.coverImageId}
              size={{ w: 900, h: 480 }}
              className="absolute inset-0 h-full w-full rounded-none"
            />
            <LinearGradient
              colors={['transparent', scrim]}
              locations={[0.2, 1]}
              style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
            />
            <View className="absolute inset-x-[18px] bottom-4">
              <Text
                numberOfLines={2}
                maxFontSizeMultiplier={MAX_SCALE}
                className="font-serif text-serif-xl text-on-photo"
              >
                {l.title}
              </Text>
              <Text
                numberOfLines={1}
                maxFontSizeMultiplier={MAX_SCALE}
                className="mt-1 font-ui text-label text-on-photo-2"
              >
                {t('discover.list_progress', { mine: l.mine, total: l.total })} ·{' '}
                {listAuthorLabel(l)}
              </Text>
            </View>
          </Pressable>
        ))
      )}
    </View>
  )
}
