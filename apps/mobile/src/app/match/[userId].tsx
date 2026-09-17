import { ScreenHeader } from '@/components/ScreenHeader'
import {
  Body,
  Caption,
  EmptyState,
  ErrorState,
  RowsSkeleton,
  SectionHeader,
  Skeleton,
} from '@/components/ui'
import { Avatar } from '@/components/ui/Avatar'
import { PlaceCover } from '@/components/ui/PlaceCover'
import { Characteristics, ScoreBadge } from '@/components/ui/patterns'
import { ApiError, api } from '@/lib/api'
import { useT } from '@/lib/i18n'
import type { UserMatchResponse } from '@/lib/types'
import { useQuery } from '@tanstack/react-query'
import { Link, useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'

// The taste-match pair page (M16) — why a match % means what it means,
// personalized to the viewer and the profile owner: reached from the match
// pill on u/[userId].tsx. Not reachable below tasteMatch's
// MIN_SHARED_FOR_MATCH — that pill shows a "rank N more" prompt instead, so
// this screen can always assume a real percentage exists.
export default function MatchScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>()
  const router = useRouter()
  const t = useT()
  const [howOpen, setHowOpen] = useState(false)
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/discover'))

  const q = useQuery({
    queryKey: ['user-match', userId],
    queryFn: () => api.get<UserMatchResponse>(`/rankings/user/${userId}/match`),
    retry: false,
  })

  if (q.isPending) {
    return (
      <View className="flex-1 bg-bg">
        <ScreenHeader onBack={goBack} backLabel={t('common.back_plain')} />
        <View className="items-center gap-3 pt-2">
          <Skeleton height={88} width={88} />
          <Skeleton height={16} width={160} />
        </View>
        <RowsSkeleton rows={4} />
      </View>
    )
  }
  if (q.isError || !q.data) {
    const gone = q.error instanceof ApiError && q.error.status === 404
    return (
      <View className="flex-1 bg-bg">
        <ScreenHeader onBack={goBack} backLabel={t('common.back_plain')} />
        {gone ? (
          <EmptyState>{t('match.not_available')}</EmptyState>
        ) : (
          <ErrorState onRetry={() => q.refetch()}>{t('match.load_error')}</ErrorState>
        )}
      </View>
    )
  }

  const {
    me,
    them,
    matchPercent,
    sharedCount,
    places,
    sharedCuisines,
    sharedNeighborhoods,
    notTried,
  } = q.data
  const theirName = them.name || them.handle || t('passport.someone_fallback')
  const agree = places.filter((p) => p.agree)
  const disagree = places.filter((p) => !p.agree)

  return (
    <View className="flex-1 bg-bg">
      <ScreenHeader onBack={goBack} backLabel={theirName} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="px-5 pb-10">
        <View className="items-center gap-2">
          <View className="flex-row items-center">
            <Avatar name={me.name || me.handle || 'm'} src={me.image} size={64} />
            <View className="-ml-4 border-bg" style={{ borderRadius: 999, borderWidth: 2 }}>
              <Avatar name={theirName} src={them.image} size={64} />
            </View>
          </View>
          <Text className="mt-1 font-serif text-title text-text">
            {t('match.you_and', { name: theirName })}
          </Text>
          {matchPercent != null ? (
            <Text className="font-serif text-rank text-accent-strong">{matchPercent}%</Text>
          ) : null}
          <Caption>{t('match.shared_count', { n: sharedCount })}</Caption>

          <Pressable
            accessibilityRole="button"
            onPress={() => setHowOpen((v) => !v)}
            className="mt-2 min-h-[36px] flex-row items-center active:opacity-70"
          >
            <Text className="font-ui-medium text-label text-accent-strong">
              {t('match.how_it_works_label')} {howOpen ? '▲' : '▾'}
            </Text>
          </Pressable>
          {howOpen ? (
            <Body className="text-center text-text-2">
              {t('match.how_it_works_body', { name: theirName })}
            </Body>
          ) : null}
        </View>

        {(sharedCuisines.length > 0 || sharedNeighborhoods.length > 0) && (
          <View>
            <SectionHeader>{t('match.shared_taste')}</SectionHeader>
            <View className="flex-row flex-wrap gap-2">
              {[...sharedCuisines, ...sharedNeighborhoods].map((tag) => (
                <View key={tag} className="rounded-pill border border-line bg-surface px-3 py-1.5">
                  <Caption className="text-text-2">{tag}</Caption>
                </View>
              ))}
            </View>
          </View>
        )}

        {agree.length > 0 && (
          <View>
            <SectionHeader>{t('match.where_you_agree')}</SectionHeader>
            {agree.map((p) => (
              <MatchPlaceRow key={p.restaurantId} place={p} theirName={theirName} />
            ))}
          </View>
        )}

        {disagree.length > 0 && (
          <View>
            <SectionHeader>{t('match.where_you_dont')}</SectionHeader>
            {disagree.map((p) => (
              <MatchPlaceRow key={p.restaurantId} place={p} theirName={theirName} />
            ))}
          </View>
        )}

        {notTried.length > 0 && (
          <View>
            <SectionHeader>{t('match.not_tried_title', { name: theirName })}</SectionHeader>
            {notTried.map((r) => (
              <Link key={r.restaurantId} href={`/r/${r.restaurantId}`} asChild>
                <Pressable className="flex-row items-center gap-3 border-line border-b py-3 active:opacity-80">
                  <PlaceCover
                    seed={r.restaurantId}
                    name={r.name}
                    coverImageId={r.coverImageId}
                    size={{ w: 200, h: 200 }}
                    className="h-12 w-12"
                  />
                  <View className="flex-1">
                    <Text className="font-serif text-serif-sm text-text" numberOfLines={1}>
                      {r.name}
                    </Text>
                    <Characteristics cuisine={r.cuisine} neighborhood={r.neighborhood} />
                  </View>
                  <ScoreBadge
                    size="sm"
                    score={r.score}
                    attribution={{ kind: 'user', label: theirName }}
                  />
                </Pressable>
              </Link>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  )
}

function MatchPlaceRow({
  place,
  theirName,
}: {
  place: UserMatchResponse['places'][number]
  theirName: string
}) {
  return (
    <Link href={`/r/${place.restaurantId}`} asChild>
      <Pressable className="flex-row items-center gap-3 border-line border-b py-3 active:opacity-80">
        <PlaceCover
          seed={place.restaurantId}
          name={place.name}
          coverImageId={place.coverImageId}
          size={{ w: 200, h: 200 }}
          className="h-12 w-12"
        />
        <View className="flex-1">
          <Text className="font-serif text-serif-sm text-text" numberOfLines={1}>
            {place.name}
          </Text>
          <Characteristics cuisine={place.cuisine} neighborhood={place.neighborhood} />
        </View>
        <View className="flex-row gap-2">
          <ScoreBadge size="sm" score={place.mine.score} attribution={{ kind: 'you' }} />
          <ScoreBadge
            size="sm"
            score={place.theirs.score}
            attribution={{ kind: 'user', label: theirName }}
          />
        </View>
      </Pressable>
    </Link>
  )
}
