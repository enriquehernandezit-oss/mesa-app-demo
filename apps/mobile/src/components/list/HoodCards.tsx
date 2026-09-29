import { useRouter } from 'expo-router'
import { useMemo } from 'react'
import { Pressable, Text, View } from 'react-native'

import { Button, EmptyState, MAX_SCALE } from '@/components/ui'
import { displayScore } from '@/lib/display'
import { useT } from '@/lib/i18n'
import type { Ranking } from '@/lib/types'
import { useLift } from '@/theme/useLift'
import { DATA_FIGURES } from '@/theme/vars'

// Your list by neighborhood: one card each — the name, how many spots and their average score,
// and a bar sized against your fullest neighborhood. A tap filters Your list to it.
export function HoodCards({
  rankings,
  onSelectSector,
}: {
  rankings: Ranking[]
  onSelectSector: (sector: string) => void
}) {
  const router = useRouter()
  const t = useT()
  const lift = useLift()
  // Keyed by the RAW neighborhood (nullable), not the display fallback — the filter system
  // (lib/rankingSort.ts) matches `filters.sector` against `r.neighborhood` directly, so a tap's
  // payload has to be that same raw value. The one bucket with no real neighborhood ("Santo
  // Domingo") stays inert: there's no filter value that means "unset". Memoized: this screen
  // re-renders on every filter/sort/tab change, none of which touch `rankings`.
  const hoods = useMemo(() => {
    const byHood = new Map<string | null, { count: number; sum: number }>()
    for (const r of rankings) {
      const cur = byHood.get(r.neighborhood) ?? { count: 0, sum: 0 }
      byHood.set(r.neighborhood, { count: cur.count + 1, sum: cur.sum + r.score })
    }
    return [...byHood.entries()]
      .map(([neighborhood, v]) => ({
        neighborhood,
        name: neighborhood ?? 'Santo Domingo',
        count: v.count,
        avg: v.sum / v.count,
      }))
      .sort((a, b) => b.count - a.count)
  }, [rankings])
  const max = hoods[0]?.count ?? 1
  if (hoods.length === 0)
    return (
      <EmptyState
        action={
          <Button size="sm" variant="primary" onPress={() => router.push('/rank')}>
            {t('rankings.rank_a_spot')}
          </Button>
        }
      >
        {t('rankings.barrios_empty_body')}
      </EmptyState>
    )
  return (
    <View className="gap-2 pt-1">
      {hoods.map((h) => (
        <Pressable
          key={h.name}
          accessibilityRole={h.neighborhood ? 'button' : undefined}
          disabled={!h.neighborhood}
          onPress={() => h.neighborhood && onSelectSector(h.neighborhood)}
          className="rounded-group bg-surface px-4 py-3.5 active:opacity-80"
          style={lift}
        >
          <View className="flex-row items-baseline justify-between gap-3">
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={MAX_SCALE}
              className="shrink font-serif text-serif-md text-text"
            >
              {h.name}
            </Text>
            <Text maxFontSizeMultiplier={MAX_SCALE} className="font-ui text-label text-text-muted">
              {t('rankings.hood_stats', { n: h.count })}{' '}
              <Text style={DATA_FIGURES} className="font-serif text-serif-xs text-text">
                {displayScore(h.avg)}
              </Text>
            </Text>
          </View>
          <View className="mt-2.5 h-1.5 overflow-hidden rounded-pill bg-bg-sunk">
            <View
              className="h-1.5 rounded-pill bg-accent-fill"
              style={{ width: `${(h.count / max) * 100}%` }}
            />
          </View>
        </Pressable>
      ))}
    </View>
  )
}
