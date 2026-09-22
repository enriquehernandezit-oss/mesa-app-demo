import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useLocalSearchParams, useRouter } from 'expo-router'
import { useRef, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'

import { ReportControl, pickReportReason } from '@/components/ReportControl'
import { ScreenHeader } from '@/components/ScreenHeader'
import {
  Button,
  Caption,
  EmptyState,
  ErrorState,
  RowsSkeleton,
  SectionHeader,
  Skeleton,
} from '@/components/ui'
import { Avatar } from '@/components/ui/Avatar'
import { Characteristics, ScoreBadge, Stat } from '@/components/ui/patterns'
import { toast } from '@/components/ui/toast-store'
import { useFollow } from '@/hooks/useFollow'
import { showActionSheet } from '@/lib/actionSheet'
import { ApiError, api } from '@/lib/api'
import { tagLabel } from '@/lib/display'
import { useT } from '@/lib/i18n'
import type { TheirRanking, UserRankingsResponse } from '@/lib/types'
import { DATA_FIGURES } from '@/theme/vars'

// Another person's ranked passport (mock E2) — and the surface where UGC
// moderation is exercised (App Store 1.2): report a vibe note or the member,
// block them. Blocking severs the graph and hides their content; the API 404s a
// blocked user, so this view empties out. Ported from apps/app/src/screens/user/
// UserRankings.tsx; the ⋯ dropdown (which needed outside-tap/Escape handling on
// web) becomes an inline actions row — no popover to dismiss.
export default function UserRankings() {
  const { userId } = useLocalSearchParams<{ userId: string }>()
  const router = useRouter()
  const t = useT()
  const queryClient = useQueryClient()
  const [expanded, setExpanded] = useState(false)
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/discover'))

  // "Rankeados" in the stats trio jumps straight to the list below — expand it
  // (it's capped at 4 otherwise) and scroll it into view in one tap.
  const scrollRef = useRef<ScrollView>(null)
  const rankingsY = useRef(0)
  const jumpToRankings = () => {
    setExpanded(true)
    scrollRef.current?.scrollTo({ y: rankingsY.current, animated: true })
  }

  const q = useQuery({
    queryKey: ['user-rankings', userId],
    queryFn: () => api.get<UserRankingsResponse>(`/rankings/user/${userId}`),
    retry: false,
  })

  const block = useMutation({
    mutationFn: () => api.post('/moderation/blocks', { userId }),
    onSuccess: () => {
      // Scoped, not the bare invalidateQueries() this used to be — that wiped
      // EVERYTHING, ['session'] included, forcing a full auth round-trip and
      // whole-app refetch over one block. Every surface a block actually
      // changes, named instead.
      for (const key of [
        'feed',
        'people',
        'activity',
        'user-rankings',
        'explore',
        'leaderboard',
        'trending',
        'restaurant',
        'list',
        'lists',
      ]) {
        queryClient.invalidateQueries({ queryKey: [key] })
      }
      router.replace('/discover')
    },
    onError: () => toast({ variant: 'error', message: t('passport.block_error') }),
  })
  // `initial` starts false before `q.data` resolves and re-syncs the instant
  // it does — see useFollow's own comment on why that's race-free.
  const {
    following: isFollowing,
    toggle: toggleFollow,
    pending: followPending,
  } = useFollow(userId, Boolean(q.data?.isFollowing), 'passport')

  const reportUser = useMutation({
    mutationFn: (reason: string) =>
      api.post('/moderation/reports', { targetType: 'user', targetId: userId, reason }),
    onError: () => toast({ variant: 'error', message: t('common.report_error') }),
  })

  if (q.isPending) {
    return (
      <View className="flex-1 bg-bg">
        <ScreenHeader onBack={goBack} backLabel={t('common.back_plain')} />
        <View className="items-center gap-3 pt-2">
          <Skeleton height={88} width={88} />
          <Skeleton height={14} width={120} />
          <Skeleton height={11} width={180} />
        </View>
        <RowsSkeleton rows={3} />
      </View>
    )
  }
  if (q.isError || !q.data) {
    // 404 covers deleted, suspended and blocked accounts alike — all dead ends,
    // and deliberately indistinguishable so this screen can't be used to probe
    // whether someone blocked you. A network failure is a different thing and
    // gets a retry.
    const gone = q.error instanceof ApiError && q.error.status === 404
    return (
      <View className="flex-1 bg-bg">
        <ScreenHeader onBack={goBack} backLabel={t('common.back_plain')} />
        {gone ? (
          <EmptyState>{t('passport.not_available')}</EmptyState>
        ) : (
          <ErrorState onRetry={() => q.refetch()}>{t('passport.load_error')}</ErrorState>
        )}
      </View>
    )
  }

  // isFollowing comes from useFollow above, not q.data directly — it stays in
  // sync with the server value but flips optimistically on tap.
  const { user, rankings, matchPercent, sharedCount, followerCount, followingCount } = q.data
  const firstName = (user.name || user.handle || '').split(' ')[0] || t('passport.someone_fallback')
  const barrio = user.neighborhood?.name
  const shown = expanded ? rankings : rankings.slice(0, 4)

  return (
    <View className="flex-1 bg-bg">
      <ScreenHeader
        onBack={goBack}
        backLabel={user.name || user.handle || t('common.back_plain')}
      />
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerClassName="px-5 pb-10"
      >
        <View className="items-center gap-1">
          <Avatar name={user.name || user.handle || 'm'} src={user.image} size={88} />
          {user.handle ? <Text className="mt-2 text-label text-text-2">@{user.handle}</Text> : null}
          {barrio ? <Caption>{barrio}</Caption> : null}
          {matchPercent != null ? (
            <Pressable
              accessibilityRole="button"
              className="mt-2 items-center gap-1"
              onPress={() => router.push(`/match/${userId}`)}
            >
              {/* A match % IS a control here — it opens the pair page. */}
              <View className="min-h-[36px] justify-center rounded-pill bg-accent-fill px-3">
                <Text className="font-ui-medium text-label text-on-accent">
                  {t('passport.match_percent', { n: matchPercent })}
                </Text>
              </View>
              {/* The denominator behind the percentage — a match with no shared
                  count is the least trustworthy way to show a number. */}
              <Caption className="text-micro">
                {t('passport.shared_spots', { n: sharedCount })}
              </Caption>
            </Pressable>
          ) : sharedCount > 0 ? (
            // 1-2 shared spots: below tasteMatch's MIN_SHARED_FOR_MATCH, so
            // there's no honest percentage yet — say what's missing instead.
            <Caption className="mt-2 text-micro">
              {t('passport.match_need_more', { n: 3 - sharedCount })}
            </Caption>
          ) : null}

          {/* Same trio as your own profile — the passport is the same object. */}
          <View className="mt-4 flex-row justify-around self-stretch">
            <Stat
              n={String(followerCount)}
              l={t('profile.followers')}
              onPress={() => router.push(`/people/${userId}?tab=followers`)}
            />
            <Stat
              n={String(followingCount)}
              l={t('profile.following')}
              onPress={() => router.push(`/people/${userId}?tab=following`)}
            />
            <Stat n={String(rankings.length)} l={t('profile.ranked')} onPress={jumpToRankings} />
          </View>

          <View className="mt-4 flex-row items-center gap-3">
            <Button
              variant="primary"
              className="w-auto px-6"
              disabled={followPending}
              onPress={toggleFollow}
            >
              {isFollowing ? t('passport.following_button') : t('passport.follow_button')}
            </Button>
          </View>

          {/* Report / block — the moderation entry points (App Store 1.2). */}
          <View className="mt-3 flex-row gap-5">
            <Pressable
              accessibilityRole="button"
              disabled={reportUser.isPending}
              onPress={async () => {
                const reason = await pickReportReason('user')
                if (reason) reportUser.mutate(reason)
              }}
              className="min-h-[44px] justify-center active:opacity-60"
            >
              <Text className="font-ui text-eyebrow text-text-muted uppercase tracking-eyebrow">
                {t('passport.report')}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={async () => {
                const picked = await showActionSheet({
                  title: t('passport.block_confirm_title', { name: firstName }),
                  message: t('passport.block_confirm_message'),
                  options: [{ label: t('passport.block'), destructive: true }],
                })
                if (picked === 0) block.mutate()
              }}
              className="min-h-[44px] justify-center active:opacity-60"
            >
              <Text className="font-ui text-eyebrow text-status-packed uppercase tracking-eyebrow">
                {t('passport.block')}
              </Text>
            </Pressable>
          </View>
        </View>

        {rankings.length === 0 ? (
          <EmptyState>{t('passport.no_rankings')}</EmptyState>
        ) : (
          <View
            onLayout={(e) => {
              rankingsY.current = e.nativeEvent.layout.y
            }}
          >
            {/* One expand control instead of two: the header used to show an
                inert "Todos N" caption while a second, separate Pressable
                below did the actual expanding — same information, only one of
                the two worked. */}
            <SectionHeader
              action={
                rankings.length > 4 ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setExpanded((v) => !v)}
                    className="min-h-[44px] justify-center active:opacity-60"
                  >
                    <Text className="font-ui text-eyebrow text-text-muted uppercase tracking-eyebrow">
                      {expanded
                        ? t('restaurant.show_less')
                        : t('passport.show_all', { n: rankings.length })}
                    </Text>
                  </Pressable>
                ) : undefined
              }
            >
              {t('passport.their_favorites', { name: firstName })}
            </SectionHeader>
            {shown.map((r) => (
              <TheirRow key={r.id} ranking={r} />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  )
}

function TheirRow({ ranking }: { ranking: TheirRanking }) {
  const t = useT()
  return (
    <Link href={`/r/${ranking.restaurant.id}`} asChild>
      <Pressable
        accessibilityRole="button"
        className="mb-2 flex-row gap-3 rounded-card border border-line bg-surface px-3 py-2.5 active:opacity-80"
      >
        {/* Same quiet position marker as the member's own Rankings rows. */}
        <Text
          style={[DATA_FIGURES, { width: 26 }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          className={`text-center font-serif text-serif-md ${ranking.position <= 3 ? 'text-text' : 'text-text-faint'}`}
        >
          {ranking.position}
        </Text>
        <View className="flex-1">
          <Text className="font-serif text-serif-md text-text">{ranking.restaurant.name}</Text>
          <Characteristics
            priceTier={ranking.restaurant.priceTier}
            cuisine={ranking.restaurant.cuisine}
            neighborhood={ranking.neighborhood}
          />
          {(ranking.favoriteDish || (ranking.tags?.length ?? 0) > 0) && (
            <View className="mt-1 flex-row flex-wrap items-center gap-2">
              {ranking.favoriteDish && (
                <Caption className="text-text-2">
                  {t('rankings.order_this', { dish: ranking.favoriteDish })}
                </Caption>
              )}
              {(ranking.tags ?? []).map((t) => (
                <Caption key={t} className="text-micro">
                  {tagLabel(t)}
                </Caption>
              ))}
            </View>
          )}
          {ranking.note ? (
            <Text selectable className="mt-1 font-serif-italic text-serif-sm text-text-2">
              “{ranking.note}”
            </Text>
          ) : null}
          {/* Nested Pressable inside the row's own Link is fine in RN (unlike
              Link-in-Link, which has its own gesture-machinery bug — see the
              feed card's comment on the same fix). */}
          {ranking.note && ranking.noteId ? (
            <ReportControl targetType="vibe_note" targetId={ranking.noteId} />
          ) : null}
        </View>
        <ScoreBadge size="sm" score={ranking.score} attribution={{ kind: 'stated' }} />
      </Pressable>
    </Link>
  )
}
