import { useQuery } from '@tanstack/react-query'
import { LinearGradient } from 'expo-linear-gradient'
import { Link, useLocalSearchParams, useRouter } from 'expo-router'
import { useRef, useState } from 'react'
import { Animated, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native'

import { PlaceTopChrome, usePhotoPageScroll } from '@/components/place/PlaceTopChrome'
import { ScreenHeader } from '@/components/ScreenHeader'
import { Body, Caption, EmptyState, ErrorState, MAX_SCALE, Skeleton } from '@/components/ui'
import { Avatar } from '@/components/ui/Avatar'
import { ScoreStack } from '@/components/ui/patterns'
import { PlaceCover } from '@/components/ui/PlaceCover'
import { ApiError, api } from '@/lib/api'
import { cuisineLabel, listAuthorLabel, priceLabel } from '@/lib/display'
import { useT } from '@/lib/i18n'
import { imageUrl } from '@/lib/media'
import { shareListCard } from '@/lib/shareCardStore'
import { curatedListShareText } from '@/lib/shareList'
import type { ListDetailItem, ListDetailResponse } from '@/lib/types'
import { useColor } from '@/theme/useColor'
import { useLift } from '@/theme/useLift'
import { DATA_FIGURES } from '@/theme/vars'

// A curated list's detail — its members in editorial order, each with the friend signal. Reached
// from the Feed's Lists pill or a restaurant's list pills. Redesign 2: a photo that fades into the
// ground under glass back/share buttons (a solid bar with the title once it scrolls away), then
// "Featured · 9 spots", the title in the serif, who made it, and the places as numbered raised
// rows. Ported from apps/app/src/screens/list/ListScreen.tsx.
const HERO_H = 300

export default function ListScreen() {
  const t = useT()
  const router = useRouter()
  const { width } = useWindowDimensions()
  const { slug } = useLocalSearchParams<{ slug: string }>()
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/discover'))
  const bg = useColor('bg')
  const scrim = useColor('photo-scrim')
  const [noteOpen, setNoteOpen] = useState(false)
  const scrollRef = useRef<ScrollView>(null)
  const { scrollY, onScroll, setCondensedRef, condensedAt } = usePhotoPageScroll(HERO_H)

  const q = useQuery({
    queryKey: ['list', slug],
    queryFn: () => api.get<ListDetailResponse>(`/lists/${slug}`),
    retry: false,
  })

  if (q.isPending) {
    return (
      <View className="flex-1 bg-bg">
        <ScreenHeader onBack={goBack} backLabel={t('common.back_plain')} />
        <View className="gap-3 px-5 pt-2">
          <Skeleton height={224} />
          <Skeleton height={11} width={110} />
          <Skeleton height={12} width="60%" />
        </View>
      </View>
    )
  }
  if (q.isError || !q.data) {
    // A missing list is a dead end; a failed fetch is worth retrying. One
    // branch for both meant a dropped connection stranded you on a real list
    // with no way forward. (A retry button on a deleted list would lie.)
    return (
      <View className="flex-1 bg-bg">
        <ScreenHeader onBack={goBack} backLabel={t('common.back_plain')} />
        {q.error instanceof ApiError && q.error.status === 404 ? (
          <EmptyState>{t('lists.not_found')}</EmptyState>
        ) : (
          <ErrorState onRetry={() => q.refetch()}>{t('lists.load_error')}</ErrorState>
        )}
      </View>
    )
  }

  const { list, items } = q.data
  const share = () =>
    shareListCard({
      eyebrow: list.title,
      subtitle: listAuthorLabel(list),
      items: items.map((r) => ({ position: r.position, name: r.name })),
      coverUrl: imageUrl(list.coverImageId ?? items[0]?.coverImageId, { w: 1080, h: 780 }),
      text: curatedListShareText(list.title, slug),
    })

  return (
    <View className="flex-1 bg-bg">
      <Animated.ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={onScroll}
        contentContainerClassName="pb-10"
      >
        <View style={{ height: HERO_H, width }}>
          <PlaceCover
            name={list.title}
            coverImageId={list.coverImageId ?? items[0]?.coverImageId}
            size={{ w: 1000, h: 750 }}
            className="h-full w-full rounded-none"
          />
          {/* A veil at the top so the status bar and glass buttons read on any photo, and a fade
              at the bottom into the ground the title sits on. */}
          <LinearGradient
            colors={[scrim, 'transparent']}
            locations={[0, 0.35]}
            style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, opacity: 0.4 }}
          />
          <LinearGradient
            colors={['transparent', bg]}
            style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 100 }}
          />
        </View>

        <View className="-mt-3.5 px-5">
          <Text
            maxFontSizeMultiplier={MAX_SCALE}
            className="font-ui-semibold text-label text-text-muted"
          >
            {t('lists.featured_count', { n: items.length })}
          </Text>
          <Text
            maxFontSizeMultiplier={MAX_SCALE}
            className="mt-1 font-serif text-display text-text"
          >
            {list.title}
          </Text>
          {list.subtitle ? <Body className="mt-1.5 text-subhead">{list.subtitle}</Body> : null}

          {/* Who curated it — mirrors listAuthorLabel's "by Mesa" / "by @handle" wording so the
              card and this page never disagree. */}
          <View className="mt-2.5 flex-row items-center gap-2">
            <Avatar
              name={list.authorName || 'Mesa'}
              src={imageUrl(list.authorAvatarId, { w: 80, h: 80 })}
              size={24}
            />
            <Caption className="flex-1 text-meta">{listAuthorLabel(list)}</Caption>
            {list.curationNote ? (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: noteOpen }}
                onPress={() => setNoteOpen((v) => !v)}
                hitSlop={8}
                className="active:opacity-70"
              >
                <Text
                  maxFontSizeMultiplier={MAX_SCALE}
                  className="font-ui-semibold text-label text-text"
                >
                  {t('lists.how_we_made_it')}
                </Text>
              </Pressable>
            ) : null}
          </View>
          {noteOpen && list.curationNote ? (
            <Body className="mt-2 text-subhead text-text-2">{list.curationNote}</Body>
          ) : null}
          {list.description ? (
            <Body className="mt-2.5 text-subhead">{list.description}</Body>
          ) : null}
        </View>

        <View className="mt-4 px-4">
          {items.map((r) => (
            <ListRow key={r.id} item={r} />
          ))}
        </View>
      </Animated.ScrollView>

      <PlaceTopChrome
        name={list.title}
        score={null}
        onBack={goBack}
        onShare={share}
        onTop={() => scrollRef.current?.scrollTo({ y: 0, animated: true })}
        scrollY={scrollY}
        fadeStart={condensedAt - 80}
        fadeEnd={condensedAt}
        setterRef={setCondensedRef}
      />
    </View>
  )
}

// One place on the list: its number, its picture, name and meta, and — if you have been, or your
// friends have — the score, with whose it is.
function ListRow({ item: r }: { item: ListDetailItem }) {
  const t = useT()
  const lift = useLift()
  const meta = [cuisineLabel(r.cuisine), r.neighborhood, priceLabel(r.priceTier)]
    .filter(Boolean)
    .join(' · ')
  return (
    <Link href={`/r/${r.id}`} asChild>
      <Pressable
        accessibilityRole="button"
        className="mb-2 flex-row items-center gap-3 rounded-group bg-surface py-2.5 pl-3 pr-3.5 active:opacity-80"
        style={lift}
      >
        <Text
          style={[DATA_FIGURES, { width: 18 }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          className="text-center font-serif text-serif-sm text-text-muted"
        >
          {r.position}
        </Text>
        <View className="h-[50px] w-[50px] overflow-hidden rounded-[15px]">
          <PlaceCover
            name={r.name}
            coverImageId={r.coverImageId}
            size={{ w: 150, h: 150 }}
            className="h-full w-full rounded-none"
          />
        </View>
        <View className="min-w-0 flex-1">
          <Text
            numberOfLines={2}
            maxFontSizeMultiplier={MAX_SCALE}
            className="font-serif text-serif-sm text-text"
          >
            {r.name}
          </Text>
          {meta ? (
            <Text
              numberOfLines={2}
              maxFontSizeMultiplier={MAX_SCALE}
              className="mt-0.5 font-ui text-meta text-text-muted"
            >
              {meta}
            </Text>
          ) : null}
        </View>
        {r.myScore != null ? (
          <ScoreStack score={r.myScore} size="sm" label={t('common.you')} />
        ) : r.friendCount > 0 && r.friendAvg != null ? (
          <ScoreStack
            score={r.friendAvg}
            size="sm"
            label={t('friends.count_badge', { n: r.friendCount })}
          />
        ) : null}
      </Pressable>
    </Link>
  )
}
