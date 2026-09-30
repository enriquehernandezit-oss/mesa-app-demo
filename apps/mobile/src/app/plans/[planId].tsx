import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { LinearGradient } from 'expo-linear-gradient'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useRef } from 'react'
import { Animated, Pressable, ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { PlaceTopChrome, usePhotoPageScroll } from '@/components/place/PlaceTopChrome'
import { StatusBadge } from '@/components/plans/parts'
import { ScreenHeader } from '@/components/ScreenHeader'
import { Group, RowButton } from '@/components/SettingsRow'
import {
  Body,
  Button,
  Caption,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  MAX_SCALE,
  RowsSkeleton,
  SectionHeader,
} from '@/components/ui'
import { Avatar } from '@/components/ui/Avatar'
import { CheckCircle } from '@/components/ui/CheckCircle'
import { SendIcon } from '@/components/ui/icons'
import { PlaceCover } from '@/components/ui/PlaceCover'
import { showSheet } from '@/components/ui/Sheet'
import { toast } from '@/components/ui/toast-store'
import { showActionSheet } from '@/lib/actionSheet'
import { track } from '@/lib/analytics'
import { ApiError, api } from '@/lib/api'
import { captureError } from '@/lib/errors'
import { tapSelect, tapSuccess } from '@/lib/haptics'
import { useT } from '@/lib/i18n'
import { isPastPlan } from '@/lib/plans'
import { sharePlan } from '@/lib/sharePlan'
import { formatPlanDate } from '@/lib/time'
import type { PlanDetail, PlanMember, PlanReply } from '@/lib/types'
import { useColor } from '@/theme/useColor'

// A single plan — the RSVP/vote/confirm surface every Planes row leads to.
// `isHost`/`myReply`/`myVote` on the response already carry the viewer's own
// relationship to the plan, so no separate "am I the host" check runs here.
// Redesign 2: the chosen spot's photo tops the page, fading into the ground under its glass back
// and share buttons; the vote is a card of rows with a pick mark; the guests are grouped rows.
export default function PlanDetailScreen() {
  const t = useT()
  const { planId } = useLocalSearchParams<{ planId: string }>()
  const router = useRouter()
  const queryClient = useQueryClient()
  const insets = useSafeAreaInsets()
  const bg = useColor('bg')
  const scrim = useColor('photo-scrim')
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/plans'))
  const heroH = 220 + insets.top
  const { scrollY, onScroll, setCondensedRef, condensedAt } = usePhotoPageScroll(heroH)
  const scrollRef = useRef<ScrollView>(null)
  const q = useQuery({
    queryKey: ['plan', planId],
    queryFn: () => api.get<PlanDetail>(`/plans/${planId}`),
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['plan', planId] })
    queryClient.invalidateQueries({ queryKey: ['plans'] })
    queryClient.invalidateQueries({ queryKey: ['notifications'] })
  }

  const reply = useMutation({
    mutationFn: (body: { reply?: PlanReply; voteRestaurantId?: string }) =>
      api.post(`/plans/${planId}/reply`, body),
    onSuccess: (_data, body) => {
      tapSelect()
      if (body.reply) track('plan_replied', { reply: body.reply })
      if (body.voteRestaurantId) track('plan_voted')
      invalidate()
    },
    onError: (err) => {
      captureError(err, 'plans.reply')
      toast({ variant: 'error', message: t('plans.reply_save_error') })
    },
  })

  const confirm = useMutation({
    mutationFn: (restaurantId: string) => api.post(`/plans/${planId}/confirm`, { restaurantId }),
    onSuccess: () => {
      tapSuccess()
      track('plan_confirmed')
      invalidate()
    },
    onError: (err) => {
      captureError(err, 'plans.confirm')
      toast({ variant: 'error', message: t('plans.confirm_error') })
    },
  })

  const cancel = useMutation({
    mutationFn: () => api.post(`/plans/${planId}/cancel`),
    onSuccess: () => {
      track('plan_cancelled')
      invalidate()
      toast({ message: t('plans.cancelled_toast') })
      router.back()
    },
    onError: (err) => {
      captureError(err, 'plans.cancel')
      toast({ variant: 'error', message: t('plans.cancel_error') })
    },
  })

  const plan = q.data

  if (q.isPending) {
    return (
      <View className="flex-1 bg-bg">
        <ScreenHeader onBack={goBack} backLabel={t('common.back_plain')} />
        <View className="px-5">
          <RowsSkeleton rows={3} thumb={64} />
        </View>
      </View>
    )
  }
  if (q.isError || !plan) {
    const forbidden = q.error instanceof ApiError && q.error.status === 403
    return (
      <View className="flex-1 bg-bg">
        <ScreenHeader onBack={goBack} backLabel={t('common.back_plain')} />
        {forbidden ? (
          <EmptyState>{t('plans.forbidden')}</EmptyState>
        ) : q.error instanceof ApiError && q.error.status === 404 ? (
          <EmptyState>{t('plans.not_found')}</EmptyState>
        ) : (
          <ErrorState onRetry={() => q.refetch()}>{t('plans.detail_load_error')}</ErrorState>
        )}
      </View>
    )
  }

  const chosen = plan.options.find((o) => o.id === plan.chosenRestaurantId)
  const cover = chosen ?? plan.options[0]
  const cancelled = plan.status === 'cancelled'
  const past = isPastPlan(plan)
  const canRespond = !plan.isHost && !cancelled && !past
  const voting = plan.status === 'open'

  const openConfirmSheet = async () => {
    const idx = await showSheet({
      title: t('plans.confirm_spot_title'),
      options: plan.options.map((o) => ({
        label: `${o.name} · ${t('plans.votes_count', { n: o.votes ?? 0 })}`,
      })),
      selectedIndex: plan.options.findIndex((o) => o.id === plan.chosenRestaurantId),
    })
    if (idx != null) confirm.mutate(plan.options[idx].id)
  }

  const openCancelConfirm = async () => {
    const idx = await showActionSheet({
      title: t('plans.cancel_confirm_title'),
      message: t('plans.cancel_confirm_message'),
      options: [{ label: t('plans.cancel_confirm_button'), destructive: true }],
      cancelLabel: t('plans.cancel_confirm_back'),
    })
    if (idx === 0) cancel.mutate()
  }

  const groups: Record<'going' | 'maybe' | 'pending' | 'declined', PlanMember[]> = {
    going: plan.members.filter((m) => m.reply === 'going'),
    maybe: plan.members.filter((m) => m.reply === 'maybe'),
    pending: plan.members.filter((m) => m.reply === 'pending'),
    declined: plan.members.filter((m) => m.reply === 'declined'),
  }

  return (
    <View className="flex-1 bg-bg">
      <Animated.ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={onScroll}
        contentContainerClassName="pb-10"
      >
        <View style={{ height: heroH }}>
          <PlaceCover
            name={cover?.name ?? plan.host.name}
            coverImageId={cover?.coverImageId ?? null}
            size={{ w: 1000, h: 700 }}
            className="h-full w-full rounded-none"
          />
          {/* A veil at the top so the status bar and glass buttons read on any photo, and a fade
              at the bottom into the ground the title sits on. */}
          <LinearGradient
            colors={[scrim, 'transparent']}
            locations={[0, 0.35]}
            style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, opacity: 0.4 }}
          />
          <LinearGradient
            colors={['transparent', bg]}
            style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 90 }}
          />
        </View>

        <View className="-mt-2.5 px-5">
          <Text maxFontSizeMultiplier={MAX_SCALE} className="font-serif text-headline text-text">
            {cancelled
              ? t('plans.cancelled_title')
              : chosen
                ? chosen.name
                : t('plans.voting_open_title')}
          </Text>
          <Body className="mt-1.5 text-subhead">
            {formatPlanDate(plan.startsAt)} ·{' '}
            {plan.isHost
              ? t('plans.hosted_by_you')
              : t('plans.hosted_by', { name: plan.host.name })}
          </Body>
          {plan.note ? (
            <Text
              maxFontSizeMultiplier={MAX_SCALE}
              className="mt-2 font-serif text-serif-sm text-text-2"
            >
              “{plan.note}”
            </Text>
          ) : null}
          {(cancelled || past) && (
            <View className="mt-3 flex-row gap-2">
              {cancelled ? <StatusBadge>{t('plans.cancelled_badge')}</StatusBadge> : null}
              {past && !cancelled ? <StatusBadge>{t('plans.past_chip')}</StatusBadge> : null}
            </View>
          )}

          {canRespond && (
            <View className="mt-5 flex-row gap-2">
              {/* Guarded on reply.isPending (also shared by the vote row below) —
                  unguarded, a fast double-tap fired two overlapping requests with
                  no feedback in between, which read as "nothing happened, tap
                  again." */}
              <Chip
                state={plan.myReply === 'going' ? 'selected' : 'default'}
                disabled={reply.isPending}
                onPress={() => reply.mutate({ reply: 'going' })}
              >
                {t('plans.reply_going')}
              </Chip>
              <Chip
                state={plan.myReply === 'maybe' ? 'selected' : 'default'}
                disabled={reply.isPending}
                onPress={() => reply.mutate({ reply: 'maybe' })}
              >
                {t('plans.reply_maybe')}
              </Chip>
              <Chip
                state={plan.myReply === 'declined' ? 'selected' : 'default'}
                disabled={reply.isPending}
                onPress={() => reply.mutate({ reply: 'declined' })}
              >
                {t('plans.reply_declined')}
              </Chip>
            </View>
          )}

          {plan.options.length > 1 && (
            <View>
              <SectionHeader>
                {voting ? t('plans.voting_section') : t('plans.options_section')}
              </SectionHeader>
              <Card className="px-4 py-2">
                {plan.options.map((o) => {
                  const mine = plan.myVote === o.id
                  return (
                    <Pressable
                      key={o.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected: mine }}
                      disabled={!voting || plan.isHost || reply.isPending}
                      onPress={() => reply.mutate({ voteRestaurantId: o.id })}
                      className="flex-row items-center gap-3 py-2 active:opacity-80"
                    >
                      <View className="h-[46px] w-[46px] overflow-hidden rounded-sm">
                        <PlaceCover
                          name={o.name}
                          coverImageId={o.coverImageId}
                          size={{ w: 138, h: 138 }}
                          className="h-full w-full rounded-none"
                        />
                      </View>
                      <View className="min-w-0 flex-1">
                        <Text
                          numberOfLines={1}
                          maxFontSizeMultiplier={MAX_SCALE}
                          className="font-serif text-serif-sm text-text"
                        >
                          {o.name}
                        </Text>
                        <Caption className="text-micro">
                          {t('plans.votes_count', { n: o.votes ?? 0 })}
                        </Caption>
                      </View>
                      {voting && !plan.isHost ? <CheckCircle on={mine} /> : null}
                    </Pressable>
                  )
                })}
              </Card>
              {plan.isHost && voting && (
                <Button
                  className="mt-3 min-h-[42px]"
                  variant="secondary"
                  size="sm"
                  loading={confirm.isPending}
                  onPress={openConfirmSheet}
                >
                  {t('plans.confirm_spot_button')}
                </Button>
              )}
            </View>
          )}

          {groups.going.length > 0 || plan.isHost ? (
            <MemberGroup
              label={t('plans.group_going', { n: groups.going.length + 1 })}
              rows={[
                {
                  id: plan.host.id,
                  name: plan.host.name,
                  handle: plan.host.handle,
                  image: plan.host.image,
                  badge: t('plans.host_tag'),
                },
                ...groups.going.map((m) => ({
                  id: m.id,
                  name: m.name,
                  handle: m.handle,
                  image: m.image,
                  badge: voting ? voteBadge(t, m, plan.options) : undefined,
                })),
              ]}
            />
          ) : null}
          {groups.maybe.length > 0 && (
            <MemberGroup
              label={t('plans.group_maybe', { n: groups.maybe.length })}
              rows={groups.maybe.map((m) => ({
                id: m.id,
                name: m.name,
                handle: m.handle,
                image: m.image,
                badge: voting ? voteBadge(t, m, plan.options) : undefined,
              }))}
            />
          )}
          {groups.pending.length > 0 && (
            <MemberGroup
              label={t('plans.group_pending', { n: groups.pending.length })}
              rows={groups.pending.map((m) => ({
                id: m.id,
                name: m.name,
                handle: m.handle,
                image: m.image,
              }))}
            />
          )}
          {groups.declined.length > 0 && (
            <MemberGroup
              label={t('plans.group_declined', { n: groups.declined.length })}
              rows={groups.declined.map((m) => ({
                id: m.id,
                name: m.name,
                handle: m.handle,
                image: m.image,
              }))}
            />
          )}

          <View className="mt-6 gap-3">
            {plan.isHost && !cancelled && !past ? (
              <Button
                variant="secondary"
                size="sm"
                className="min-h-[42px]"
                icon={<SendIcon size={16} />}
                onPress={() => router.push(`/plans/invite?planId=${plan.id}`)}
              >
                {t('plans.invite_more')}
              </Button>
            ) : null}
            {plan.isHost && !cancelled ? (
              <Pressable
                accessibilityRole="button"
                onPress={openCancelConfirm}
                className="min-h-[44px] items-center justify-center active:opacity-70"
              >
                <Text
                  maxFontSizeMultiplier={MAX_SCALE}
                  className="font-ui-medium text-label text-danger"
                >
                  {t('plans.cancel_confirm_button')}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </Animated.ScrollView>

      {/* Glass back / share over the photo; a solid bar with the title once it scrolls away. */}
      <PlaceTopChrome
        name={
          cancelled
            ? t('plans.cancelled_title')
            : chosen
              ? chosen.name
              : t('plans.voting_open_title')
        }
        score={null}
        onBack={goBack}
        onShare={() => sharePlan(plan)}
        onTop={() => scrollRef.current?.scrollTo({ y: 0, animated: true })}
        scrollY={scrollY}
        fadeStart={condensedAt - 80}
        fadeEnd={condensedAt}
        setterRef={setCondensedRef}
      />
    </View>
  )
}

function voteBadge(
  t: ReturnType<typeof useT>,
  m: PlanMember,
  options: PlanDetail['options'],
): string | undefined {
  if (!m.voteRestaurantId) return undefined
  const spot = options.find((o) => o.id === m.voteRestaurantId)
  return spot ? t('plans.voted_spot', { name: spot.name }) : undefined
}

// One group of guests — "Going (3)" over a rounded card of rows: a face, a name and, at the
// right, a badge (the host, the spot they voted for).
function MemberGroup({
  label,
  rows,
}: {
  label: string
  rows: { id: string; name: string; handle: string | null; image: string | null; badge?: string }[]
}) {
  const router = useRouter()
  return (
    <View>
      <SectionHeader>{label}</SectionHeader>
      <Group>
        {rows.map((m, i) => (
          <RowButton
            key={m.id}
            last={i === rows.length - 1}
            onPress={() => router.push(`/u/${m.id}`)}
          >
            <Avatar name={m.name || m.handle || 'm'} src={m.image} size={34} />
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={MAX_SCALE}
              className="flex-1 font-ui text-body text-text"
            >
              {m.name || m.handle}
            </Text>
            {m.badge ? <StatusBadge>{m.badge}</StatusBadge> : null}
          </RowButton>
        ))}
      </Group>
    </View>
  )
}
