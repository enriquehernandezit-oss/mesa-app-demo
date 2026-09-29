import { useQuery } from '@tanstack/react-query'
import { Link } from 'expo-router'
import { useRef, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'

import { Body, Caption, Chip, ErrorState, MAX_SCALE, RowsSkeleton } from '@/components/ui'
import { Avatar } from '@/components/ui/Avatar'
import { useProfile } from '@/hooks/useProfile'
import { api } from '@/lib/api'
import { useT } from '@/lib/i18n'
import type { LeaderboardRow } from '@/lib/types'
import { useLift } from '@/theme/useLift'
import { DATA_FIGURES } from '@/theme/vars'

// Citywide leaderboard — who's eaten the most of Santo Domingo. Understated by design: serif
// numerals, no badges, your own row raised. Each row is a COUNT of spots, not a score, so it
// can't be read as a rating. Ported from apps/app/src/screens/leaderboard/LeaderboardScreen.tsx.
//
// scope (M7): city (everyone) or friends (followingIds ∪ followerIds ∪ me,
// server-side). myRank only ever exceeds the visible rows in city+all-time —
// see leaderboard.ts's own comment — so that's the one case the "jump to my
// row" affordance below has to treat as unreachable rather than broken.
export default function LeaderboardScreen() {
  const t = useT()
  const lift = useLift()
  const myId = useProfile(true, 300_000).data?.profile.id
  const [period, setPeriod] = useState<'all' | 'month'>('month')
  const [scope, setScope] = useState<'all' | 'friends'>('all')
  const q = useQuery({
    queryKey: ['leaderboard', period, scope],
    queryFn: () =>
      api.get<{ leaderboard: LeaderboardRow[]; myRank: number | null }>(
        `/leaderboard?period=${period}&scope=${scope}`,
      ),
  })
  const rows = q.data?.leaderboard ?? []
  const myRankVisible = q.data?.myRank != null && q.data.myRank <= rows.length
  const myRankLabel = q.data?.myRank
    ? t(scope === 'friends' ? 'leaderboard.my_rank_friends' : 'leaderboard.my_rank', {
        n: q.data.myRank,
      })
    : null
  // "Eres #N" jumps straight to that row — rows are all mounted (a plain
  // ScrollView, not virtualized), so each records its own offset on layout
  // and the tap just scrolls there. Only meaningful when myRank is actually
  // one of the rendered rows (myRankVisible) — city+all-time can now report a
  // true rank past the top 50, and there's nothing on screen to scroll to.
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
        <Body className="mb-4 text-text-muted">
          {scope === 'friends' ? t('leaderboard.scope_friends') : 'Santo Domingo'}
        </Body>

        {/* Two choices in one row: the period, then (after a hairline) the scope. */}
        <View className="mb-4 flex-row flex-wrap items-center gap-2">
          <Chip
            state={period === 'month' ? 'selected' : 'default'}
            onPress={() => setPeriod('month')}
          >
            {t('leaderboard.period_month')}
          </Chip>
          <Chip state={period === 'all' ? 'selected' : 'default'} onPress={() => setPeriod('all')}>
            {t('leaderboard.period_all')}
          </Chip>
          <View className="mx-1 h-5 w-px bg-line-strong" />
          <Chip state={scope === 'all' ? 'selected' : 'default'} onPress={() => setScope('all')}>
            {t('leaderboard.scope_city')}
          </Chip>
          <Chip
            state={scope === 'friends' ? 'selected' : 'default'}
            onPress={() => setScope('friends')}
          >
            {t('leaderboard.scope_friends')}
          </Chip>
        </View>

        {myRankLabel ? (
          myRankVisible ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                const y = rowY.current[(q.data?.myRank ?? 1) - 1]
                if (y != null) {
                  scrollRef.current?.scrollTo({ y: cardY.current + y, animated: true })
                }
              }}
              className="mb-3 self-start active:opacity-70"
            >
              <Text
                maxFontSizeMultiplier={MAX_SCALE}
                className="font-serif text-serif-md text-text"
              >
                {myRankLabel}
              </Text>
            </Pressable>
          ) : (
            <Text
              maxFontSizeMultiplier={MAX_SCALE}
              className="mb-3 font-serif text-serif-md text-text"
            >
              {myRankLabel}
            </Text>
          )
        ) : null}

        {q.isPending ? (
          <RowsSkeleton rows={6} thumb={38} />
        ) : q.isError ? (
          <ErrorState onRetry={() => q.refetch()}>{t('leaderboard.load_error')}</ErrorState>
        ) : rows.length === 0 && scope === 'friends' ? (
          <Body className="text-text-muted">{t('leaderboard.empty_friends')}</Body>
        ) : (
          // Row offsets are relative to this column, so its own y is added back for the "you're
          // #N" jump.
          <View
            onLayout={(e) => {
              cardY.current = e.nativeEvent.layout.y
            }}
          >
            {rows.map((r, i) => {
              const mineRow = r.id === myId
              return (
                <Link key={r.id} href={`/u/${r.id}`} asChild>
                  <Pressable
                    onLayout={(e) => {
                      rowY.current[i] = e.nativeEvent.layout.y
                    }}
                    className={`mb-1.5 flex-row items-center gap-3 rounded-[20px] px-3 py-[9px] active:opacity-80 ${mineRow ? 'bg-surface' : ''}`}
                    style={mineRow ? lift : undefined}
                  >
                    <Text
                      style={DATA_FIGURES}
                      maxFontSizeMultiplier={1.1}
                      className="w-[26px] font-serif text-serif-md text-text-muted"
                    >
                      {i + 1}
                    </Text>
                    <Avatar name={r.name || r.handle || 'm'} src={r.image} size={40} />
                    <View className="min-w-0 flex-1">
                      <Text
                        numberOfLines={1}
                        maxFontSizeMultiplier={MAX_SCALE}
                        className="font-serif text-serif-sm text-text"
                      >
                        {r.name || r.handle}
                      </Text>
                      <Caption numberOfLines={1}>
                        {[r.handle ? `@${r.handle}` : null, r.neighborhood]
                          .filter(Boolean)
                          .join(' · ')}
                      </Caption>
                    </View>
                    <View className="items-end">
                      <Text
                        style={DATA_FIGURES}
                        maxFontSizeMultiplier={MAX_SCALE}
                        className="font-serif text-serif-md text-text"
                      >
                        {r.count}
                      </Text>
                      <Text
                        maxFontSizeMultiplier={MAX_SCALE}
                        className="font-ui text-eyebrow text-text-muted"
                      >
                        {t('leaderboard.spots', { n: r.count })}
                      </Text>
                    </View>
                  </Pressable>
                </Link>
              )
            })}
          </View>
        )}
      </ScrollView>
    </View>
  )
}
