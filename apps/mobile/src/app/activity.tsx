import {
  Button,
  Caption,
  Chip,
  ChipRail,
  EmptyState,
  ErrorState,
  Eyebrow,
  RowsSkeleton,
} from '@/components/ui'
import { Avatar } from '@/components/ui/Avatar'
import { PlaceCover } from '@/components/ui/PlaceCover'
import { markActivitySeen } from '@/lib/activitySeen'
import { api } from '@/lib/api'
import { displayScore } from '@/lib/display'
import { timeAgo } from '@/lib/time'
import type { ActivityItem } from '@/lib/types'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, Stack, useRouter } from 'expo-router'
import { useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'

// The screen behind the bell (mock F2): cheers, new followers, friends ranking
// your saved spots, and friends out-ranking you — every row carries its own
// action. "Marcar leído" advances the local watermark, clearing the bell badge.
// Ported from apps/app/src/screens/activity/ActivityScreen.tsx. The inert
// "Mesas" (table activity) filter is cut — Tonight is out of the launch subset.
type Filter = 'all' | 'follows' | 'rankings'
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Todo' },
  { value: 'follows', label: 'Seguidores' },
  { value: 'rankings', label: 'Rankings' },
]

function bucket(at: string): 'today' | 'week' | 'earlier' {
  const d = new Date(at).getTime()
  const now = new Date()
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  if (d >= startToday) return 'today'
  if (d >= startToday - 6 * 86_400_000) return 'week'
  return 'earlier'
}
const SECTIONS: { key: 'today' | 'week' | 'earlier'; label: string }[] = [
  { key: 'today', label: 'Hoy' },
  { key: 'week', label: 'Esta semana' },
  { key: 'earlier', label: 'Antes' },
]

export default function ActivityScreen() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<Filter>('all')
  const q = useQuery({
    queryKey: ['activity'],
    queryFn: () => api.get<{ activity: ActivityItem[] }>('/activity'),
  })

  const markRead = () => {
    markActivitySeen()
    queryClient.invalidateQueries({ queryKey: ['activity'] })
  }

  const items = q.data?.activity ?? []
  const shown = items.filter((a) => {
    if (filter === 'all') return true
    if (filter === 'follows') return a.type === 'follow'
    return a.type === 'cheers' || a.type === 'saved_ranked' || a.type === 'friend_ranked'
  })
  const sections = SECTIONS.map((s) => ({
    ...s,
    items: shown.filter((a) => bucket(a.at) === s.key),
  })).filter((s) => s.items.length > 0)

  return (
    <View className="flex-1 bg-bg">
      {/* The bar is the system's (see MesaStack); only its action is ours. */}
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              onPress={markRead}
              className="min-h-[44px] justify-center active:opacity-60"
            >
              <Text className="font-ui-medium text-label text-accent-strong">Marcar leído</Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerClassName="px-5 pb-10"
        contentInsetAdjustmentBehavior="automatic"
      >
        <ChipRail className="mb-4">
          {FILTERS.map((f) => (
            <Chip
              key={f.value}
              size="sm"
              state={filter === f.value ? 'selected' : 'default'}
              onPress={() => setFilter(f.value)}
            >
              {f.label}
            </Chip>
          ))}
        </ChipRail>

        {q.isPending ? (
          <RowsSkeleton />
        ) : q.isError ? (
          <ErrorState onRetry={() => q.refetch()}>No se pudo cargar la actividad.</ErrorState>
        ) : sections.length === 0 ? (
          <EmptyState
            body="Los cheers, nuevos seguidores, y amigos probando tus spots guardados aparecen aquí."
            action={
              <Button size="sm" variant="secondary" onPress={() => router.push('/explore')}>
                Descubre gente
              </Button>
            }
          >
            Tranquilo por ahora.
          </EmptyState>
        ) : (
          sections.map((s) => (
            <View key={s.key}>
              <Eyebrow className="mb-2 mt-5 font-mono text-text-muted">{s.label}</Eyebrow>
              {s.items.map((a) => (
                <ActivityRow key={`${a.type}-${a.user.id}-${a.at}`} a={a} />
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  )
}

function ActivityRow({ a }: { a: ActivityItem }) {
  const queryClient = useQueryClient()
  const [followed, setFollowed] = useState(Boolean(a.followsBack))
  const follow = useMutation({
    mutationFn: () => api.post('/social/follow', { userId: a.user.id }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['feed'] }),
  })

  const place = a.restaurant ? (
    <Text className="font-ui-medium text-text">{a.restaurant.name}</Text>
  ) : null

  return (
    <View className="flex-row items-center gap-3 border-line border-b py-3">
      <Link href={`/u/${a.user.id}`} asChild>
        <Pressable className="active:opacity-80">
          <Avatar name={a.user.name || a.user.handle || 'm'} src={a.user.image} size={36} />
        </Pressable>
      </Link>
      <View className="flex-1">
        <Text className="font-ui text-body text-text">
          <Text className="font-ui-semibold">{a.user.name || a.user.handle}</Text>{' '}
          {a.type === 'cheers' && <>le dio cheers a tu ranking de {place}</>}
          {a.type === 'follow' && 'empezó a seguirte'}
          {a.type === 'saved_ranked' && <>rankeó {place} — está en tu lista</>}
          {a.type === 'friend_ranked' && a.score != null && (
            <>
              rankeó {place} con {displayScore(a.score)}
              {a.yourScore != null && Math.abs(a.score - a.yourScore) >= 10 && (
                <> — {a.score > a.yourScore ? 'le gustó más que a ti' : 'a ti te gustó más'}</>
              )}
            </>
          )}
        </Text>
        <Caption className="font-mono text-micro">{timeAgo(a.at)}</Caption>
      </View>
      {a.type === 'follow' ? (
        followed ? (
          <Caption className="font-mono text-micro">Siguiendo</Caption>
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setFollowed(true)
              follow.mutate()
            }}
            className="min-h-[36px] justify-center rounded-pill border border-accent px-4 active:opacity-70"
          >
            <Text className="font-mono text-eyebrow text-accent-strong">Seguir</Text>
          </Pressable>
        )
      ) : (
        a.restaurant && (
          <Link href={`/r/${a.restaurant.id}`} asChild>
            <Pressable className="active:opacity-80">
              <PlaceCover
                seed={a.restaurant.id}
                name={a.restaurant.name}
                coverImageId={a.restaurant.coverImageId}
                size={{ w: 96, h: 96 }}
                className="h-11 w-11"
              />
            </Pressable>
          </Link>
        )
      )}
    </View>
  )
}
