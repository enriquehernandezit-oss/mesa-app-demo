import { Body, Caption, EmptyState, ErrorState, Eyebrow, Skeleton } from '@/components/ui'
import { Avatar } from '@/components/ui/Avatar'
import { PlaceCover } from '@/components/ui/PlaceCover'
import { Characteristics, ScoreBadge } from '@/components/ui/patterns'
import { ApiError, api } from '@/lib/api'
import { listAuthorLabel } from '@/lib/display'
import { useT } from '@/lib/i18n'
import { cloudinaryUrl } from '@/lib/media'
import type { ListDetailResponse } from '@/lib/types'
import { DATA_FIGURES } from '@/theme/vars'
import { useQuery } from '@tanstack/react-query'
import { Link, Stack, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'

// A curated list's detail — its members in editorial order, each with the
// friend signal. Reached from the Discover carousel or a restaurant's list
// pills. Ported from apps/app/src/screens/list/ListScreen.tsx.
export default function ListScreen() {
  const t = useT()
  const { slug } = useLocalSearchParams<{ slug: string }>()
  const q = useQuery({
    queryKey: ['list', slug],
    queryFn: () => api.get<ListDetailResponse>(`/lists/${slug}`),
    retry: false,
  })
  const [noteOpen, setNoteOpen] = useState(false)

  return (
    <View className="flex-1 bg-bg">
      {/* Inline title, not large: this screen opens on a hero image, and a
          large title stacked above it just pushes the photo off the fold. */}
      <Stack.Screen options={{ title: q.data?.list.title ?? '', headerLargeTitle: false }} />
      {q.isPending ? (
        <View>
          <Skeleton height={224} />
          <View className="gap-3 px-5 pt-4">
            <Skeleton height={11} width={110} />
            <Skeleton height={12} width="60%" />
          </View>
        </View>
      ) : q.isError || !q.data ? (
        // A missing list is a dead end; a failed fetch is worth retrying. One
        // branch for both meant a dropped connection stranded you on a real list
        // with no way forward. (A retry button on a deleted list would lie.)
        q.error instanceof ApiError && q.error.status === 404 ? (
          <EmptyState>{t('lists.not_found')}</EmptyState>
        ) : (
          <ErrorState onRetry={() => q.refetch()}>{t('lists.load_error')}</ErrorState>
        )
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="pb-10">
          <View className="h-56">
            <PlaceCover
              seed={slug}
              name={q.data.list.title}
              coverImageId={q.data.list.coverImageId}
              size={{ w: 1000, h: 560 }}
              className="h-full w-full"
            />
            <View
              className="absolute right-4 rounded-pill bg-surface px-2 py-1"
              style={{ bottom: 10 }}
            >
              <Caption className="text-micro">{t('lists.film_candlelit')}</Caption>
            </View>
          </View>
          <View className="px-5">
            <Eyebrow className="mt-4">
              {t('lists.featured_count', { n: q.data.items.length })}
            </Eyebrow>
            {q.data.list.subtitle ? <Body className="mt-1">{q.data.list.subtitle}</Body> : null}

            {/* M15 — who curated it. Mirrors listAuthorLabel's "por Mesa" /
                "por @handle" wording so the card and this page never
                disagree. */}
            <View className="mt-3 flex-row items-center gap-2">
              <Avatar
                name={q.data.list.authorName || 'Mesa'}
                src={cloudinaryUrl(q.data.list.authorAvatarId, { w: 80, h: 80 })}
                size={24}
              />
              <Caption>{listAuthorLabel(q.data.list)}</Caption>
            </View>

            {q.data.list.description ? (
              <Body className="mt-3">{q.data.list.description}</Body>
            ) : null}

            {q.data.list.curationNote ? (
              <View className="mt-3">
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setNoteOpen((v) => !v)}
                  className="min-h-[36px] flex-row items-center active:opacity-70"
                >
                  <Text className="font-ui-medium text-label text-accent-strong">
                    {t('lists.how_we_made_it')} {noteOpen ? '▲' : '▾'}
                  </Text>
                </Pressable>
                {noteOpen ? <Caption className="mt-1">{q.data.list.curationNote}</Caption> : null}
              </View>
            ) : null}

            <View className="mt-4">
              {q.data.items.map((r) => (
                <Link key={r.id} href={`/r/${r.id}`} asChild>
                  <Pressable className="mb-2 flex-row items-center gap-3 rounded-card border border-line bg-surface px-3 py-2.5 active:opacity-80">
                    <Text
                      style={DATA_FIGURES}
                      className="w-5 font-ui-medium text-eyebrow text-text-muted"
                    >
                      {r.position}
                    </Text>
                    <PlaceCover
                      seed={r.id}
                      name={r.name}
                      coverImageId={r.coverImageId}
                      size={{ w: 200, h: 200 }}
                      className="h-12 w-12"
                    />
                    <View className="flex-1">
                      <Text className="font-serif text-serif-sm text-text" numberOfLines={1}>
                        {r.name}
                      </Text>
                      <Characteristics
                        priceTier={r.priceTier}
                        cuisine={r.cuisine}
                        neighborhood={r.neighborhood}
                      />
                    </View>
                    {r.myScore != null ? (
                      <ScoreBadge size="sm" score={r.myScore} attribution={{ kind: 'you' }} />
                    ) : r.friendCount > 0 && r.friendAvg != null ? (
                      <ScoreBadge
                        size="sm"
                        score={r.friendAvg}
                        attribution={{ kind: 'friends', count: r.friendCount }}
                      />
                    ) : null}
                  </Pressable>
                </Link>
              ))}
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  )
}
