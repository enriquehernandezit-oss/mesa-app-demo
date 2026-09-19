import { Body, Caption, ErrorState, Eyebrow, RowsSkeleton, Segmented } from '@/components/ui'
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
  const cardY = useRef(0)

  return (
    <View className="flex-1 bg-bg">
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerClassName="px-5 pb-10"
        contentInsetAdjustmentBehavior="automatic"
      >
        <Eyebrow className="mb-4">Santo Domingo</Eyebrow>

        <Segmented
          className="mb-4"
          value={period}
          onChange={setPeriod}
          options={[
            { value: 'month', label: t('leaderboard.period_month') },
            { value: 'all', label: t('leaderboard.period_all') },
          ]}
        />

        {q.data?.myRank ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              const y = rowY.current[(q.data?.myRank ?? 1) - 1]
              if (y != null) scrollRef.current?.scrollTo({ y: cardY.current + y, animated: true })
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
          // One white grouped card on the cream ground. Row offsets are
          // relative to the card, so the card's own y is added back for the
          // "you're #N" jump.
          <View
            onLayout={(e) => {
              cardY.current = e.nativeEvent.layout.y
            }}
            className="overflow-hidden rounded-card border border-line bg-surface px-3"
          >
            {rows.map((r, i) => (
              <Link key={r.id} href={`/u/${r.id}`} asChild>
                <Pressable
                  onLayout={(e) => {
                    rowY.current[i] = e.nativeEvent.layout.y
                  }}
                  className={`flex-row items-center gap-3 py-3 active:opacity-80 ${i === rows.length - 1 ? '' : 'border-line border-b'}`}
                >
                  {/* The position is a quiet marker, not the headline: the row
                      size of the name beside it, brass only for the podium. */}
                  <Text
                    style={DATA_FIGURES}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    maxFontSizeMultiplier={1.1}
                    className={`w-6 text-center font-serif-semibold text-serif-sm ${i < 3 ? 'text-accent-strong' : 'text-text-faint'}`}
                  >
                    {i + 1}
                  </Text>
                  <Avatar name={r.name || r.handle || 'm'} src={r.image} size={38} />
                  <View className="flex-1">
                    <Text className="font-serif text-serif-sm text-text" numberOfLines={1}>
                      {r.name || r.handle}
                    </Text>
                    <Caption numberOfLines={1}>
                      {[r.handle ? `@${r.handle}` : null, r.neighborhood]
                        .filter(Boolean)
                        .join(' · ')}
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
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  )
}
