import { useQuery } from '@tanstack/react-query'
import { Link, useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'

import { ScreenHeader } from '@/components/ScreenHeader'
import {
  Body,
  Caption,
  EmptyState,
  ErrorState,
  MAX_SCALE,
  RowsSkeleton,
  SectionHeader,
  Skeleton,
} from '@/components/ui'
import { Avatar } from '@/components/ui/Avatar'
import { ChevronIcon } from '@/components/ui/icons'
import { PlaceCover } from '@/components/ui/PlaceCover'
import { ApiError, api } from '@/lib/api'
import { cuisineLabel, displayScore } from '@/lib/display'
import { useT } from '@/lib/i18n'
import type { UserMatchResponse } from '@/lib/types'
import { useLift } from '@/theme/useLift'
import { DATA_FIGURES } from '@/theme/vars'

// The taste-match pair page (M16) — why a match % means what it means,
// personalized to the viewer and the profile owner: reached from the match
// pill on u/[userId].tsx. Not reachable below tasteMatch's
// MIN_SHARED_FOR_MATCH — that pill shows a "rank N more" prompt instead, so
// this screen can always assume a real percentage exists. Redesign 2: the two faces, the
// percentage huge in the serif, the shared taste as pills, and each place as a raised row with
// both scores side by side.
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

  const theirFirst = theirName.split(' ')[0] || theirName
  return (
    <View className="flex-1 bg-bg">
      <ScreenHeader onBack={goBack} backLabel={t('common.back_plain')} title={theirName} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="pb-10">
        <View className="items-center px-6">
          <View className="flex-row items-center">
            <Avatar name={me.name || me.handle || 'm'} src={me.image} size={64} />
            <View className="-ml-4 border-bg" style={{ borderRadius: 999, borderWidth: 2 }}>
              <Avatar name={theirName} src={them.image} size={64} />
            </View>
          </View>
          <Text
            maxFontSizeMultiplier={MAX_SCALE}
            className="mt-3 text-center font-serif text-serif-xl text-text"
          >
            {t('match.you_and', { name: theirName })}
          </Text>
          {matchPercent != null ? (
            <Text
              style={DATA_FIGURES}
              allowFontScaling={false}
              className="mt-1 font-serif text-score text-text"
            >
              {matchPercent}%
            </Text>
          ) : null}
          <Caption className="mt-1.5 text-pill">
            {t('match.shared_count', { n: sharedCount })}
          </Caption>

          <Pressable
            hitSlop={{ top: 4, bottom: 4, left: 0, right: 0 }}
            accessibilityRole="button"
            accessibilityState={{ expanded: howOpen }}
            onPress={() => setHowOpen((v) => !v)}
            className="mt-2 min-h-[36px] flex-row items-center gap-1 active:opacity-70"
          >
            <Text
              maxFontSizeMultiplier={MAX_SCALE}
              className="font-ui-semibold text-pill text-text"
            >
              {t('match.how_it_works_label')}
            </Text>
            <View style={{ transform: [{ rotate: howOpen ? '-90deg' : '90deg' }] }}>
              <ChevronIcon size={13} />
            </View>
          </Pressable>
          {howOpen ? (
            <Body className="text-center text-subhead text-text-2">
              {t('match.how_it_works_body', { name: theirName })}
            </Body>
          ) : null}
        </View>

        {(sharedCuisines.length > 0 || sharedNeighborhoods.length > 0) && (
          <View className="px-5">
            <SectionHeader>{t('match.shared_taste')}</SectionHeader>
            <View className="flex-row flex-wrap gap-1.5">
              {[...sharedCuisines, ...sharedNeighborhoods].map((tag) => (
                <TagPill key={tag}>{tag}</TagPill>
              ))}
            </View>
          </View>
        )}

        {agree.length > 0 && (
          <View className="px-4">
            <View className="px-1">
              <SectionHeader>{t('match.where_you_agree')}</SectionHeader>
            </View>
            {agree.map((p) => (
              <MatchPlaceRow key={p.restaurantId} place={p} theirName={theirFirst} />
            ))}
          </View>
        )}

        {disagree.length > 0 && (
          <View className="px-4">
            <View className="px-1">
              <SectionHeader>{t('match.where_you_dont')}</SectionHeader>
            </View>
            {disagree.map((p) => (
              <MatchPlaceRow key={p.restaurantId} place={p} theirName={theirFirst} />
            ))}
          </View>
        )}

        {notTried.length > 0 && (
          <View className="px-4">
            <View className="px-1">
              <SectionHeader>{t('match.not_tried_title', { name: theirName })}</SectionHeader>
            </View>
            {notTried.map((r) => (
              <PlaceRow
                key={r.restaurantId}
                id={r.restaurantId}
                name={r.name}
                coverImageId={r.coverImageId}
                cuisine={r.cuisine}
                neighborhood={r.neighborhood}
                scores={[{ score: r.score, label: theirFirst }]}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  )
}

// A shared cuisine or neighbourhood, as a small white pill.
function TagPill({ children }: { children: string }) {
  const lift = useLift()
  return (
    <View className="h-[30px] justify-center rounded-pill bg-chip px-3" style={lift}>
      <Text maxFontSizeMultiplier={MAX_SCALE} className="font-ui-semibold text-label text-text">
        {children}
      </Text>
    </View>
  )
}

// One place with the scores next to it — yours and theirs, each a serif figure over who it is.
function PlaceRow({
  id,
  name,
  coverImageId,
  cuisine,
  neighborhood,
  scores,
}: {
  id: string
  name: string
  coverImageId: string | null
  cuisine: string | null
  neighborhood: string | null
  scores: { score: number; label: string }[]
}) {
  const lift = useLift()
  const meta = [cuisineLabel(cuisine), neighborhood].filter(Boolean).join(' · ')
  return (
    <Link href={`/r/${id}`} asChild>
      <Pressable
        accessibilityRole="button"
        className="mb-2 flex-row items-center gap-3 rounded-group bg-surface px-3 py-2.5 active:opacity-80"
        style={lift}
      >
        <View className="h-[48px] w-[48px] overflow-hidden rounded-[15px]">
          <PlaceCover
            name={name}
            coverImageId={coverImageId}
            size={{ w: 144, h: 144 }}
            className="h-full w-full rounded-none"
          />
        </View>
        <View className="min-w-0 flex-1">
          <Text
            numberOfLines={2}
            maxFontSizeMultiplier={MAX_SCALE}
            className="font-serif text-serif-sm text-text"
          >
            {name}
          </Text>
          {meta ? (
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={MAX_SCALE}
              className="mt-0.5 font-ui text-meta text-text-muted"
            >
              {meta}
            </Text>
          ) : null}
        </View>
        {scores.map((s) => (
          <View key={s.label} className="items-center">
            <Text
              style={DATA_FIGURES}
              maxFontSizeMultiplier={MAX_SCALE}
              className="font-serif text-serif-md text-text"
            >
              {displayScore(s.score)}
            </Text>
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={MAX_SCALE}
              className="mt-0.5 max-w-[56px] font-ui text-eyebrow text-text-muted"
            >
              {s.label}
            </Text>
          </View>
        ))}
      </Pressable>
    </Link>
  )
}

function MatchPlaceRow({
  place,
  theirName,
}: {
  place: UserMatchResponse['places'][number]
  theirName: string
}) {
  const t = useT()
  return (
    <PlaceRow
      id={place.restaurantId}
      name={place.name}
      coverImageId={place.coverImageId}
      cuisine={place.cuisine}
      neighborhood={place.neighborhood}
      scores={[
        { score: place.mine.score, label: t('common.you') },
        { score: place.theirs.score, label: theirName },
      ]}
    />
  )
}
