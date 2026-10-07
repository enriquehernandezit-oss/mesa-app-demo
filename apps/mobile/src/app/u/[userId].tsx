import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useLocalSearchParams, useRouter } from 'expo-router'
import { useRef, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'

import { MentionText } from '@/components/MentionText'
import { MutualLine } from '@/components/MutualLine'
import { ProfileStats } from '@/components/profile/ProfileStats'
import { pickReportReason } from '@/components/ReportControl'
import { ScreenHeader } from '@/components/ScreenHeader'
import {
  Button,
  Caption,
  EmptyState,
  ErrorState,
  IconButton,
  MAX_SCALE,
  RowsSkeleton,
  SectionHeader,
  Skeleton,
} from '@/components/ui'
import { Avatar } from '@/components/ui/Avatar'
import { CheckIcon, ClockIcon, LockIcon, MoreIcon, UserPlusIcon } from '@/components/ui/icons'
import { ScoreStack } from '@/components/ui/patterns'
import { PlaceCover } from '@/components/ui/PlaceCover'
import { showSheet } from '@/components/ui/Sheet'
import { toast } from '@/components/ui/toast-store'
import { useFollow } from '@/hooks/useFollow'
import { showActionSheet } from '@/lib/actionSheet'
import { ApiError, api } from '@/lib/api'
import { cuisineLabel } from '@/lib/display'
import { useT } from '@/lib/i18n'
import { invalidateAfterBlockChange } from '@/lib/invalidateAfterSocial'
import type { TheirRanking, UserRankingsResponse } from '@/lib/types'
import { useLift } from '@/theme/useLift'
import { DATA_FIGURES } from '@/theme/vars'

// Another person's ranked passport (Redesign 2: the identity centred, the match as an accent pill,
// a card of counts, Follow, and their favorites as numbered cards) — and the surface where UGC
// moderation is exercised (App Store 1.2): report a vibe note or the member,
// block them. Blocking severs the graph and hides their content; the API 404s a
// blocked user, so this view empties out. Ported from apps/app/src/screens/user/
// UserRankings.tsx. Both member-level actions live behind the header's "···"
// (founder's call) rather than as a permanent actions row on the page: visiting
// someone's passport shouldn't lead with two ways to act against them. 1.2 asks
// that reporting be reachable and clearly available — a labelled overflow menu
// one tap from the top of the screen is both; a standing row in the layout was
// never the requirement.
export default function UserRankings() {
  const { userId } = useLocalSearchParams<{ userId: string }>()
  const router = useRouter()
  const t = useT()
  const [expanded, setExpanded] = useState(false)
  const lift = useLift()
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
      // Every surface a block changes (lib/invalidateAfterSocial.ts) — not the bare invalidateQueries()
      // this once was, which wiped ['session'] too and forced a full auth round-trip.
      invalidateAfterBlockChange()
      // Back to wherever they came from (their profile is gone from it). A `replace('/discover')` here
      // mounted a SECOND tab navigator under the first; it is only the fallback for a cold deep link.
      goBack()
    },
    onError: () => toast({ variant: 'error', message: t('passport.block_error') }),
  })
  // `initial` starts false before `q.data` resolves and re-syncs the instant
  // it does — see useFollow's own comment on why that's race-free.
  // A private account shows Requested until its owner answers (F1): the response says whether
  // this one is private, so the button can flip straight to it.
  const {
    status: followStatus,
    toggle: toggleFollow,
    pending: followPending,
  } = useFollow(userId, q.data?.followStatus ?? 'none', 'passport', q.data?.user.isPrivate)

  const reportUser = useMutation({
    mutationFn: (reason: string) =>
      api.post('/moderation/reports', { targetType: 'user', targetId: userId, reason }),
    onSuccess: () => toast({ message: t('common.reported') }),
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

  // The follow state comes from useFollow above, not q.data directly — it stays in
  // sync with the server value but flips optimistically on tap.
  const {
    user,
    rankings,
    matchPercent,
    sharedCount,
    followerCount,
    followingCount,
    mutual,
    locked,
    rankedCount,
  } = q.data
  const firstName = (user.name || user.handle || '').split(' ')[0] || t('passport.someone_fallback')
  // A sector, or where they live when it is none of them ("Otro").
  const neighborhood = user.neighborhood?.name ?? user.homeArea
  const shown = expanded ? rankings : rankings.slice(0, 4)

  // The moderation entry points (App Store 1.2), in the same "···" shape the
  // Rankings cards use: a chooser in Mesa's own Sheet, then — for block — the
  // native single-destructive confirm it already had (see lib/actionSheet.ts on
  // why that one confirm stays a system sheet).
  async function openMenu() {
    const i = await showSheet({
      title: user.name || user.handle || firstName,
      options: [{ label: t('passport.report') }, { label: t('passport.block'), destructive: true }],
    })
    if (i === 0) {
      const reason = await pickReportReason('user')
      if (reason) reportUser.mutate(reason)
    } else if (i === 1) {
      const picked = await showActionSheet({
        title: t('passport.block_confirm_title', { name: firstName }),
        message: t('passport.block_confirm_message'),
        options: [{ label: t('passport.block'), destructive: true }],
      })
      if (picked === 0) block.mutate()
    }
  }

  return (
    <View className="flex-1 bg-bg">
      <ScreenHeader
        onBack={goBack}
        backLabel={t('common.back_plain')}
        right={
          <IconButton
            accessibilityLabel={t('rankings.more_actions')}
            onPress={openMenu}
            icon={<MoreIcon size={18} color="text" />}
          />
        }
      />
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerClassName="pb-10"
      >
        <View className="items-center px-6">
          <Avatar name={user.name || user.handle || 'm'} src={user.image} size={88} />
          <Text
            numberOfLines={2}
            maxFontSizeMultiplier={MAX_SCALE}
            className="mt-3 text-center font-serif text-greeting text-text"
          >
            {user.name || user.handle}
          </Text>
          {user.handle || neighborhood ? (
            <Text
              maxFontSizeMultiplier={MAX_SCALE}
              className="mt-1 text-center font-ui text-label text-text-muted"
            >
              {[user.handle ? `@${user.handle}` : null, neighborhood].filter(Boolean).join(' · ')}
            </Text>
          ) : null}
          {matchPercent != null ? (
            <View className="mt-3 flex-row flex-wrap items-center justify-center gap-2">
              {/* A match % IS a control here — it opens the pair page. */}
              <Pressable
                hitSlop={{ top: 6, bottom: 6, left: 0, right: 0 }}
                accessibilityRole="button"
                onPress={() => router.push(`/match/${userId}`)}
                className="min-h-[32px] justify-center rounded-pill bg-accent-fill px-3 py-1 active:opacity-80"
              >
                <Text
                  maxFontSizeMultiplier={MAX_SCALE}
                  className="font-ui-semibold text-pill text-on-accent"
                >
                  {t('passport.match_percent', { n: matchPercent })}
                </Text>
              </Pressable>
              {/* The denominator behind the percentage — a match with no shared count is the
                  least trustworthy way to show a number. */}
              <Caption className="text-meta">
                {t('passport.shared_spots', { n: sharedCount })}
              </Caption>
            </View>
          ) : sharedCount > 0 ? (
            // 1-2 shared spots: below tasteMatch's MIN_SHARED_FOR_MATCH, so there's no honest
            // percentage yet — say what's missing instead.
            <Caption className="mt-3 text-meta">
              {t('passport.match_need_more', { n: 3 - sharedCount })}
            </Caption>
          ) : null}
        </View>

        <View className="mt-5">
          <ProfileStats
            items={[
              // Counts are for everyone; the lists behind them are not, on a private account.
              {
                n: String(followerCount),
                l: t('profile.followers'),
                go: locked ? undefined : () => router.push(`/people/${userId}?tab=followers`),
              },
              {
                n: String(followingCount),
                l: t('profile.following'),
                go: locked ? undefined : () => router.push(`/people/${userId}?tab=following`),
              },
              {
                n: String(rankedCount),
                l: t('profile.ranked'),
                go: locked ? undefined : jumpToRankings,
              },
            ]}
          />
        </View>

        {mutual.count > 0 ? (
          <View className="mt-3 items-center px-6">
            <MutualLine userId={userId} mutual={mutual} ring="bg" center />
          </View>
        ) : null}

        <View className="mt-4 items-center">
          <Button
            variant={followStatus === 'none' ? 'primary' : 'secondary'}
            size="sm"
            className="min-h-[46px] px-6"
            icon={
              followStatus === 'following' ? (
                <CheckIcon size={17} color="text" />
              ) : followStatus === 'requested' ? (
                <ClockIcon size={17} color="text" />
              ) : (
                <UserPlusIcon size={17} color="on-ink" />
              )
            }
            disabled={followPending}
            onPress={toggleFollow}
          >
            {followStatus === 'following'
              ? t('passport.following_button')
              : followStatus === 'requested'
                ? t('passport.requested_button')
                : t('passport.follow_button')}
          </Button>
        </View>

        {locked ? (
          // A private account you don't follow: the header and counts above, and this instead of
          // the list, the notes and the match.
          <View className="mx-4 mt-6 items-center rounded-group bg-surface px-6 py-6" style={lift}>
            <View className="h-[48px] w-[48px] items-center justify-center rounded-pill bg-chip">
              <LockIcon size={22} />
            </View>
            <Text
              maxFontSizeMultiplier={MAX_SCALE}
              className="mt-3 text-center font-serif text-serif-md text-text"
            >
              {t('passport.private_title')}
            </Text>
            <Text
              maxFontSizeMultiplier={MAX_SCALE}
              className="mt-1 text-center font-ui text-subhead text-text-muted"
            >
              {followStatus === 'requested'
                ? t('passport.private_requested', { name: firstName })
                : t('passport.private_body', { name: firstName })}
            </Text>
          </View>
        ) : rankings.length === 0 ? (
          <EmptyState>{t('passport.no_rankings')}</EmptyState>
        ) : (
          <View
            className="px-4"
            onLayout={(e) => {
              rankingsY.current = e.nativeEvent.layout.y
            }}
          >
            {/* One expand control instead of two: the header used to show an
                inert "Todos N" caption while a second, separate Pressable
                below did the actual expanding — same information, only one of
                the two worked. */}
            <View className="px-1">
              <SectionHeader
                action={
                  rankings.length > 4 ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setExpanded((v) => !v)}
                      hitSlop={8}
                      className="active:opacity-60"
                    >
                      <Text
                        maxFontSizeMultiplier={MAX_SCALE}
                        className="font-ui-semibold text-label text-accent"
                      >
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
            </View>
            {shown.map((r) => (
              <TheirRow key={r.id} ranking={r} />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  )
}

// Reporting a single vibe note (App Store 1.2) is the row's own "···", the same
// shape the restaurant page's friend rows use — not the "Reportar" line this
// used to render under every note. This list runs a screenful, and a row can't
// afford a second line of text whose only job is to accuse its author.
function TheirRow({ ranking }: { ranking: TheirRanking }) {
  const t = useT()
  const lift = useLift()
  const report = useMutation({
    mutationFn: ({ reason, noteId }: { reason: string; noteId: string }) =>
      api.post('/moderation/reports', { targetType: 'vibe_note', targetId: noteId, reason }),
    onSuccess: () => toast({ message: t('common.reported') }),
    onError: () => toast({ variant: 'error', message: t('common.report_error') }),
  })
  const noteId = ranking.noteId
  const onReportNote =
    ranking.note && noteId
      ? async () => {
          const reason = await pickReportReason('vibe_note')
          if (reason) report.mutate({ reason, noteId })
        }
      : undefined

  const meta = [cuisineLabel(ranking.restaurant.cuisine), ranking.neighborhood]
    .filter(Boolean)
    .join(' · ')
  return (
    <Link href={`/r/${ranking.restaurant.id}`} asChild>
      <Pressable
        accessibilityRole="button"
        className="mb-2 flex-row items-start gap-3 rounded-group bg-surface py-3 pl-3 pr-3.5 active:opacity-80"
        style={lift}
      >
        {/* The position: the top three in ink, the rest quieter. */}
        <Text
          maxFontSizeMultiplier={MAX_SCALE}
          style={[DATA_FIGURES, { width: 18 }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          className={`pt-3.5 text-center font-serif text-serif-md ${ranking.position <= 3 ? 'text-text' : 'text-text-faint'}`}
        >
          {ranking.position}
        </Text>
        <View className="h-[52px] w-[52px] overflow-hidden rounded-[16px]">
          <PlaceCover
            name={ranking.restaurant.name}
            coverImageId={ranking.restaurant.coverImageId}
            size={{ w: 156, h: 156 }}
            className="h-full w-full rounded-none"
          />
        </View>
        <View className="min-w-0 flex-1">
          <Text
            numberOfLines={2}
            maxFontSizeMultiplier={MAX_SCALE}
            className="font-serif text-serif-sm text-text"
          >
            {ranking.restaurant.name}
          </Text>
          {meta ? (
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={MAX_SCALE}
              className="mt-0.5 font-ui text-meta text-text-muted"
            >
              {meta}
            </Text>
          ) : null}
          {ranking.favoriteDish ? (
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={MAX_SCALE}
              className="mt-0.5 font-ui text-meta text-text-2"
            >
              {t('rankings.order_this', { dish: ranking.favoriteDish })}
            </Text>
          ) : null}
          {ranking.note ? (
            <Text
              selectable
              maxFontSizeMultiplier={MAX_SCALE}
              className="mt-1 font-serif text-serif-xs text-text"
            >
              “<MentionText text={ranking.note} />”
            </Text>
          ) : null}
        </View>
        <ScoreStack score={ranking.score} size="sm" />
        {/* Nested Pressable inside the row's own Link is fine in RN (unlike
            Link-in-Link, which has its own gesture-machinery bug — see the
            feed card's comment on the same fix): RN hands it the touch, so the
            row's tap through to the place is untouched. */}
        {onReportNote ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('report.note_a11y')}
            onPress={onReportNote}
            hitSlop={8}
            className="-mr-1 h-8 w-7 items-center justify-center active:opacity-60"
          >
            <MoreIcon size={18} color="text-faint" />
          </Pressable>
        ) : null}
      </Pressable>
    </Link>
  )
}
