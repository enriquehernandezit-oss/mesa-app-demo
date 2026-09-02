import { Body, Caption, Chip, Eyebrow } from '@/components/ui'
import { Avatar } from '@/components/ui/Avatar'
import { api } from '@/lib/api'
import { displayScore } from '@/lib/display'
import type { LeaderboardRow } from '@/lib/types'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'expo-router'
import { useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'

// Citywide leaderboard — who's eaten the most of Santo Domingo. Understated by
// design: brass serif numerals, no badges. Ported from apps/app/src/screens/
// leaderboard/LeaderboardScreen.tsx.
export default function LeaderboardScreen() {
  const [period, setPeriod] = useState<'all' | 'month'>('month')
  const q = useQuery({
    queryKey: ['leaderboard', period],
    queryFn: () =>
      api.get<{ leaderboard: LeaderboardRow[]; myRank: number | null }>(
        `/leaderboard?period=${period}`,
      ),
  })
  const rows = q.data?.leaderboard ?? []

  return (
    <View className="flex-1 bg-bg">
      <ScrollView
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
            Este mes
          </Chip>
          <Chip state={period === 'all' ? 'selected' : 'default'} onPress={() => setPeriod('all')}>
            Todo el tiempo
          </Chip>
        </View>

        {q.data?.myRank ? (
          <Body className="mb-4 text-accent">Eres #{q.data.myRank} en la ciudad.</Body>
        ) : null}

        {q.isPending ? (
          <Body>Cargando…</Body>
        ) : (
          rows.map((r, i) => (
            <Link key={r.id} href={`/u/${r.id}`} asChild>
              <Pressable className="flex-row items-center gap-3 border-line border-b py-3 active:opacity-80">
                <Text className="w-6 font-serif text-serif-lg text-accent">{i + 1}</Text>
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
                  <Text className="font-serif text-serif-md text-text">{r.count}</Text>
                  <Caption>spots · prom. {displayScore(r.avgScore)}</Caption>
                </View>
              </Pressable>
            </Link>
          ))
        )}
      </ScrollView>
    </View>
  )
}
