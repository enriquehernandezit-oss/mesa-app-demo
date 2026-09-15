import {
  Button,
  Caption,
  Chip,
  ChipRail,
  EmptyState,
  ErrorState,
  RowsSkeleton,
  SectionHeader,
} from '@/components/ui'
import { Avatar } from '@/components/ui/Avatar'
import { PlaceCover } from '@/components/ui/PlaceCover'
import { useFollow } from '@/hooks/useFollow'
import { markActivitySeen } from '@/lib/activitySeen'
import { api } from '@/lib/api'
import { displayScore } from '@/lib/display'
import { useT } from '@/lib/i18n'
import { formatPlanDate, timeAgo } from '@/lib/time'
import type { ActivityItem } from '@/lib/types'
import { DATA_FIGURES } from '@/theme/vars'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { type Href, Link, useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'

// The screen behind the bell (mock F2): cheers, new followers, friends ranking
// your saved spots, and friends out-ranking you — every row carries its own
// action. "Marcar leído" advances the local watermark, clearing the bell badge.
// Ported from apps/app/src/screens/activity/ActivityScreen.tsx. The inert
// "Mesas" (table activity) filter is cut — Tonight is out of the launch subset.
type Filter = 'all' | 'follows' | 'rankings' | 'plans'

function bucket(at: string): 'today' | 'week' | 'earlier' {
  const d = new Date(at).getTime()
  const now = new Date()
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  if (d >= startToday) return 'today'
  if (d >= startToday - 6 * 86_400_000) return 'week'
  return 'earlier'
}

export default function ActivityScreen() {
  const t = useT()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<Filter>('all')
  const FILTERS: { value: Filter; label: string }[] = [
    { value: 'all', label: t('activity.filter_all') },
    { value: 'follows', label: t('activity.filter_follows') },
    { value: 'rankings', label: t('activity.filter_rankings') },
    { value: 'plans', label: t('activity.filter_plans') },
  ]
  const SECTIONS: { key: 'today' | 'week' | 'earlier'; label: string }[] = [
    { key: 'today', label: t('activity.section_today') },
    { key: 'week', label: t('activity.section_week') },
    { key: 'earlier', label: t('activity.section_earlier') },
  ]
  const q = useQuery({
    queryKey: ['activity'],
    queryFn: () => api.get<{ activity: ActivityItem[] }>('/activity'),
  })

  // Advances the watermark on the way OUT, not in — the header comment on
  // `lib/activitySeen.ts` already claimed opening this screen does this, but
  // the code only ever did it on an explicit "Marcar leído" tap that most
  // people never found. Firing on focus LOSS (not focus gain) means the badge
  // count stays stable for the whole time someone is actually looking at the
  // list, instead of zeroing the instant the screen mounts and then getting
  // stale if something new lands while they're still reading.
  useFocusEffect(
    useCallback(() => {
      return () => {
        markActivitySeen()
        queryClient.invalidateQueries({ queryKey: ['activity'] })
      }
    }, [queryClient]),
  )

  const items = q.data?.activity ?? []
  const shown = items.filter((a) => {
    if (filter === 'all') return true
    if (filter === 'follows') return a.type === 'follow'
    if (filter === 'plans') return a.type === 'plan_invite' || a.type === 'plan_reply'
    return a.type === 'cheers' || a.type === 'saved_ranked' || a.type === 'friend_ranked'
  })
  const sections = SECTIONS.map((s) => ({
    ...s,
    items: shown.filter((a) => bucket(a.at) === s.key),
  })).filter((s) => s.items.length > 0)

  return (
    <View className="flex-1 bg-bg">
      {/* The bar is entirely the system's now (see MesaStack's registration) —
          "Marcar leído" was its one custom action, retired now that leaving
          the screen advances the watermark on its own. */}
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
          <ErrorState onRetry={() => q.refetch()}>{t('activity.load_error')}</ErrorState>
        ) : sections.length === 0 ? (
          <EmptyState
            body={t('activity.empty_body')}
            action={
              <Button size="sm" variant="secondary" onPress={() => router.push('/explore')}>
                {t('activity.discover_people')}
              </Button>
            }
          >
            {t('activity.empty_title')}
          </EmptyState>
        ) : (
          sections.map((s) => (
            <View key={s.key}>
              <SectionHeader>{s.label}</SectionHeader>
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
  const t = useT()
  const router = useRouter()
  const { following, toggle, pending } = useFollow(a.user.id, Boolean(a.followsBack), 'activity')
  const isPlan = a.type === 'plan_invite' || a.type === 'plan_reply'

  // The row's primary destination — a plan when the row is one, else the
  // restaurant when the row names one, else the person. Doesn't replace the
  // avatar/cover's own nested links below, which stay their specific targets;
  // this is the fallback for everywhere else on the row (the gap around the
  // sentence, the timestamp).
  const primaryHref: Href = isPlan
    ? `/planes/${a.planId}`
    : a.restaurant
      ? `/r/${a.restaurant.id}`
      : `/u/${a.user.id}`
  const place = a.restaurant ? (
    isPlan ? (
      <Text className="font-ui-medium text-text">{a.restaurant.name}</Text>
    ) : (
      <Text
        className="font-ui-medium text-text"
        onPress={() => a.restaurant && router.push(`/r/${a.restaurant.id}`)}
        suppressHighlighting
      >
        {a.restaurant.name}
      </Text>
    )
  ) : null

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(primaryHref)}
      className="flex-row items-center gap-3 border-line border-b py-3 active:opacity-80"
    >
      <Link href={`/u/${a.user.id}`} asChild>
        <Pressable className="active:opacity-80">
          <Avatar name={a.user.name || a.user.handle || 'm'} src={a.user.image} size={36} />
        </Pressable>
      </Link>
      <View className="flex-1">
        <Text className="font-ui text-body text-text">
          <Text
            className="font-ui-semibold"
            onPress={() => router.push(`/u/${a.user.id}`)}
            suppressHighlighting
          >
            {a.user.name || a.user.handle}
          </Text>{' '}
          {a.type === 'cheers' && (
            <>
              {t('activity.cheers_prefix')}
              {place}
            </>
          )}
          {a.type === 'follow' && t('activity.followed_you')}
          {a.type === 'saved_ranked' && (
            <>
              {t('activity.ranked_prefix')}
              {place}
              {t('activity.saved_ranked_suffix')}
            </>
          )}
          {a.type === 'friend_ranked' && a.score != null && (
            <>
              {t('activity.ranked_prefix')}
              {place}
              {t('activity.ranked_with')}
              <Text style={DATA_FIGURES} className="text-accent">
                {displayScore(a.score)}
              </Text>
              {a.yourScore != null && Math.abs(a.score - a.yourScore) >= 10 && (
                <>
                  {' — '}
                  {a.score > a.yourScore ? t('activity.liked_more') : t('activity.you_liked_more')}
                </>
              )}
            </>
          )}
          {a.type === 'plan_invite' && (
            <>
              {t('activity.plan_invite_prefix')}
              {place}
              {a.startsAt ? ` · ${formatPlanDate(a.startsAt)}` : ''}
            </>
          )}
          {a.type === 'plan_reply' && (
            <>
              {a.reply === 'going'
                ? t('activity.plan_reply_going')
                : t('activity.plan_reply_maybe')}
              {t('activity.plan_reply_suffix')}
              {place}
            </>
          )}
        </Text>
        <Caption className="font-mono text-micro">{timeAgo(a.at)}</Caption>
      </View>
      {a.type === 'follow' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: following, disabled: pending }}
          disabled={pending}
          onPress={toggle}
          className={`min-h-[36px] justify-center rounded-pill border px-4 active:opacity-70 ${following ? 'border-line' : 'border-accent'}`}
        >
          <Text
            className={`font-mono text-eyebrow ${following ? 'text-text-muted' : 'text-accent-strong'}`}
          >
            {following ? t('activity.following_pill') : t('activity.follow_pill')}
          </Text>
        </Pressable>
      ) : isPlan ? (
        a.planId && (
          <Link href={`/planes/${a.planId}`} asChild>
            <Pressable className="active:opacity-80">
              <PlaceCover
                seed={a.restaurant?.id ?? a.planId}
                name={a.restaurant?.name ?? ''}
                coverImageId={a.restaurant?.coverImageId ?? null}
                size={{ w: 96, h: 96 }}
                className="h-11 w-11"
              />
            </Pressable>
          </Link>
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
    </Pressable>
  )
}
