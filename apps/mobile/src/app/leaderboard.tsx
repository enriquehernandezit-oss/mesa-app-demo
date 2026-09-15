import { Body, Caption, Chip, ErrorState, Eyebrow, RowsSkeleton } from '@/components/ui'
import { Avatar } from '@/components/ui/Avatar'
import { api } from '@/lib/api'
import { displayScore } from '@/lib/display'
import { useT } from '@/lib/i18n'
import type { LeaderboardRow } from '@/lib/types'
import { DATA_FIGURES } from '@/theme/vars'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'expo-router'
import { useRef, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'

// Citywide leaderboard — who's eaten the most of Santo Domingo. Understated by
// design: brass serif numerals, no badges. Ported from apps/app/src/screens/
// leaderboard/LeaderboardScreen.tsx.
export default function LeaderboardScreen() {
  const t = useT()
  const [period, setPeriod] = useState<'all' | 'month'>('month')
  const q = useQuery({
    queryKey: ['leaderboard', period],
    queryFn: () =>
      api.get<{ leaderboard: LeaderboardRow[]; myRank: number | null }>(
        `/leaderboard?period=${period}`,
      ),
  })
  const rows = q.data?.leaderboard ?? []
  // "Eres #N" jumps straight to that row — rows are all mounted (a plain
  // ScrollView, not virtualized), so each records its own offset on layout
  // and the tap just scrolls there.
  const scrollRef = useRef<ScrollView>(null)
  const rowY = useRef<number[]>([])

  return (
    <View className="flex-1 bg-bg">
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerClassName="px-5 pb-10"
        contentInsetAdjustmentBehavior="automatic"
      >
        <Eyebrow className="mb-4">Santo Domingo</Eyebrow>

        <View className="mb-4 flex-row gap-2">
          <Chip
            state={period === 'month' ? 'selected' : 'default'}
            onPress={() => setPeriod('month')}
          >
            {t('leaderboard.period_month')}
          </Chip>
          <Chip state={period === 'all' ? 'selected' : 'default'} onPress={() => setPeriod('all')}>
            {t('leaderboard.period_all')}
          </Chip>
        </View>

        {q.data?.myRank ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              const y = rowY.current[(q.data?.myRank ?? 1) - 1]
              if (y != null) scrollRef.current?.scrollTo({ y, animated: true })
            }}
            className="mb-4 self-start active:opacity-70"
          >
            <Body className="text-accent">{t('leaderboard.my_rank', { n: q.data.myRank })}</Body>
          </Pressable>
        ) : null}

        {q.isPending ? (
          <RowsSkeleton rows={6} thumb={38} />
        ) : q.isError ? (
          <ErrorState onRetry={() => q.refetch()}>{t('leaderboard.load_error')}</ErrorState>
        ) : (
          rows.map((r, i) => (
            <Link key={r.id} href={`/u/${r.id}`} asChild>
              <Pressable
                onLayout={(e) => {
                  rowY.current[i] = e.nativeEvent.layout.y
                }}
                className="flex-row items-center gap-3 border-line border-b py-3 active:opacity-80"
              >
                <Text style={DATA_FIGURES} className="w-6 font-serif text-serif-lg text-accent">
                  {i + 1}
                </Text>
                <Avatar name={r.name || r.handle || 'm'} src={r.image} size={38} />
                <View className="flex-1">
                  <Text className="font-serif text-serif-sm text-text" numberOfLines={1}>
                    {r.name || r.handle}
                  </Text>
                  <Caption numberOfLines={1}>
                    {[r.handle ? `@${r.handle}` : null, r.neighborhood].filter(Boolean).join(' · ')}
                  </Caption>
                </View>
                <View className="items-end">
                  {/* A COUNT, not a score — sans metadata, not the brass serif
                      a rating gets, so it can't be read as one. */}
                  <Text style={DATA_FIGURES} className="font-ui-semibold text-label text-text">
                    {r.count}
                  </Text>
                  <Caption>
                    {t('leaderboard.spots_avg')}{' '}
                    <Text style={DATA_FIGURES} className="text-accent">
                      {displayScore(r.avgScore)}
                    </Text>
                  </Caption>
                </View>
              </Pressable>
            </Link>
          ))
        )}
      </ScrollView>
    </View>
  )
}
