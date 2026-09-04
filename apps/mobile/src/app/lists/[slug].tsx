import { Body, Caption, EmptyState, ErrorState, Eyebrow, Skeleton, Title } from '@/components/ui'
import { PlaceCover } from '@/components/ui/PlaceCover'
import { Characteristics, ScoreBadge } from '@/components/ui/patterns'
import { ApiError, api } from '@/lib/api'
import type { ListDetailResponse } from '@/lib/types'
import { useQuery } from '@tanstack/react-query'
import { Link, Stack, useLocalSearchParams } from 'expo-router'
import { Pressable, ScrollView, Text, View } from 'react-native'

// A curated list's detail — its members in editorial order, each with the
// friend signal. Reached from the Discover carousel or a restaurant's list
// pills. Ported from apps/app/src/screens/list/ListScreen.tsx.
export default function ListScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  const q = useQuery({
    queryKey: ['list', slug],
    queryFn: () => api.get<ListDetailResponse>(`/lists/${slug}`),
    retry: false,
  })

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
          <EmptyState>Lista no encontrada.</EmptyState>
        ) : (
          <ErrorState onRetry={() => q.refetch()}>No se pudo cargar la lista.</ErrorState>
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
              <Caption className="font-mono text-micro">film · con velas</Caption>
            </View>
          </View>
          <View className="px-5">
            <Eyebrow className="mt-4">Destacada · {q.data.items.length} spots</Eyebrow>
            {q.data.list.subtitle ? <Body className="mt-1">{q.data.list.subtitle}</Body> : null}

            <View className="mt-4">
              {q.data.items.map((r) => (
                <Link key={r.id} href={`/r/${r.id}`} asChild>
                  <Pressable className="flex-row items-center gap-3 border-line border-b py-3 active:opacity-80">
                    <Text className="w-5 font-mono text-eyebrow text-text-muted">{r.position}</Text>
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
